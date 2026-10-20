import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session, selectinload

from app.metering import CostLimitExceeded
from app.models import utcnow
from app.projects.service import (
    get_project,
    local_mutation,
    project_error,
    project_session,
    writable_project,
)
from app.submissions.llm_review import build_context, merge_findings, review_with_model
from app.submissions.models import CodeReview, Submission
from app.submissions.schemas import (
    ArtifactOut,
    CodeReviewOut,
    CreateSubmissionInput,
    HintOut,
    HintRequest,
    LatestReviewOut,
    SolutionOut,
    SubmissionDetail,
    SubmissionList,
    SubmissionSummaryOut,
)
from app.submissions.service import (
    build_submission,
    file_artifact,
    privacy_warnings,
    text_artifacts,
)
from app.submissions.static_check import (
    analyze_python_code,
    correlate,
    needs_local_check,
    parse_log_evidence,
)

logger = logging.getLogger("studyforge.submissions")

router = APIRouter(prefix="/api", tags=["submissions"])
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]
PREVIEW_CHARS = 100_000


def _cost_limit(exc: CostLimitExceeded):
    # Same body as the other metered surfaces; the client branches on `error`.
    return project_error(402, "cost_limit_exceeded", "LLM spend limit reached")


def _submission_or_404(session: Session, submission_id: int) -> Submission:
    submission = session.get(Submission, submission_id)
    if submission is None:
        raise project_error(404, "submission_not_found", "Submission not found.")
    return submission


def _review_or_404(session: Session, review_id: int) -> CodeReview:
    review = session.get(CodeReview, review_id)
    if review is None:
        raise project_error(404, "review_not_found", "Review not found.")
    return review


def _detail(session: Session, submission: Submission) -> SubmissionDetail:
    artifacts = [
        ArtifactOut(
            id=artifact.id,
            filename=artifact.filename,
            kind=artifact.kind,
            content=(artifact.content or "")[:PREVIEW_CHARS] or None,
            size_bytes=artifact.size_bytes or 0,
            truncated=len(artifact.content or "") > PREVIEW_CHARS,
            sha256=artifact.sha256,
            created_at=artifact.created_at,
        )
        for artifact in submission.artifacts
    ]
    return SubmissionDetail(
        id=submission.id,
        project_id=submission.project_id,
        exercise_id=submission.exercise_id,
        version=submission.version,
        user_note=submission.user_note,
        status=submission.status,
        created_at=submission.created_at,
        artifacts=artifacts,
        reviews=[CodeReviewOut.model_validate(review) for review in submission.reviews],
        privacy_warnings=privacy_warnings(submission),
    )


def _summary(submission: Submission) -> SubmissionSummaryOut:
    latest = submission.reviews[0] if submission.reviews else None
    return SubmissionSummaryOut(
        id=submission.id,
        project_id=submission.project_id,
        exercise_id=submission.exercise_id,
        version=submission.version,
        status=submission.status,
        user_note=submission.user_note,
        created_at=submission.created_at,
        artifact_count=len(submission.artifacts),
        latest_review=(
            LatestReviewOut(
                id=latest.id,
                summary=latest.summary,
                finding_count=len(latest.findings or []),
            )
            if latest is not None
            else None
        ),
    )


@router.get("/projects/{project_id}/submissions", response_model=SubmissionList)
def list_project_submissions(
    project_id: int,
    session: Db,
    exercise_id: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=2_147_483_647),
):
    get_project(session, project_id)
    query = session.query(Submission).filter(Submission.project_id == project_id)
    if exercise_id:
        query = query.filter(Submission.exercise_id == exercise_id)
    total = query.count()
    rows = (
        query.options(
            selectinload(Submission.artifacts), selectinload(Submission.reviews)
        )
        .order_by(Submission.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return SubmissionList(items=[_summary(row) for row in rows], total=total)


@router.post(
    "/projects/{project_id}/submissions",
    response_model=SubmissionDetail,
    status_code=201,
    dependencies=MUTATION,
)
def create_text_submission(project_id: int, body: CreateSubmissionInput, session: Db):
    project = writable_project(session, project_id)
    artifacts = text_artifacts(
        code_filename=body.code_filename,
        code_content=body.code_content,
        log_filename=body.log_filename,
        log_content=body.log_content,
    )
    submission = build_submission(
        session,
        project,
        exercise_id=body.exercise_id,
        user_note=body.user_note,
        artifacts=artifacts,
    )
    session.commit()
    session.refresh(submission)
    logger.info(
        "submission_created project_id=%s submission_id=%s version=%s",
        project.id,
        submission.id,
        submission.version,
    )
    return _detail(session, submission)


@router.post(
    "/projects/{project_id}/submissions/upload",
    response_model=SubmissionDetail,
    status_code=201,
    dependencies=MUTATION,
)
async def upload_submission(
    project_id: int,
    session: Db,
    code_file: UploadFile | None = File(None),
    log_file: UploadFile | None = File(None),
    exercise_id: str = "",
    user_note: str = "",
):
    project = writable_project(session, project_id)
    artifacts: list[tuple[str, str, str]] = []
    if code_file is not None and code_file.filename:
        artifacts.append(file_artifact(await code_file.read(), code_file.filename, "code"))
    if log_file is not None and log_file.filename:
        artifacts.append(file_artifact(await log_file.read(), log_file.filename, "log"))
    submission = build_submission(
        session,
        project,
        exercise_id=exercise_id or None,
        user_note=user_note or None,
        artifacts=artifacts,
    )
    session.commit()
    session.refresh(submission)
    logger.info(
        "submission_uploaded project_id=%s submission_id=%s artifacts=%s",
        project.id,
        submission.id,
        len(artifacts),
    )
    return _detail(session, submission)


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
def get_submission(submission_id: int, session: Db):
    return _detail(session, _submission_or_404(session, submission_id))


@router.delete(
    "/submissions/{submission_id}", status_code=204, dependencies=MUTATION
)
def delete_submission(submission_id: int, session: Db):
    submission = _submission_or_404(session, submission_id)
    writable_project(session, submission.project_id)
    session.delete(submission)
    session.commit()
    logger.info("submission_deleted submission_id=%s", submission_id)


@router.get(
    "/submissions/{submission_id}/reviews", response_model=list[CodeReviewOut]
)
def list_reviews(submission_id: int, session: Db):
    submission = _submission_or_404(session, submission_id)
    return [CodeReviewOut.model_validate(review) for review in submission.reviews]


def _static_review(submission: Submission):
    code_findings = []
    log_findings = []
    for artifact in submission.artifacts:
        if artifact.kind == "code" and artifact.content:
            code_findings.extend(analyze_python_code(artifact.filename, artifact.content))
        elif artifact.kind == "log" and artifact.content:
            log_findings.extend(parse_log_evidence(artifact.filename, artifact.content))

    findings = code_findings + log_findings
    findings += correlate(code_findings, log_findings)
    if not log_findings:
        findings += needs_local_check(code_findings)
    return code_findings, log_findings, findings


def _hint_ladder(findings, has_log: bool) -> tuple[str, str, str, str | None]:
    has_syntax = any(f.category == "syntax_error" for f in findings)
    has_reduction = any(f.category == "tensor_shape_reduction" for f in findings)
    has_runtime = any(f.evidence_type == "user_reported" for f in findings)

    if has_syntax:
        return (
            (
                "The file does not parse. Start at the line the parser names and read the "
                "line just above it."
            ),
            (
                "Python reports the token it could not accept, which is often the line after "
                "the real mistake: an unclosed bracket, quote or colon."
            ),
            "Balance the delimiters around that block and re-run the file locally.",
            None,
        )
    if has_reduction:
        return (
            "Inspect the indexing expressions that use a bare integer on the second axis.",
            (
                "Indexing with a scalar removes that axis: a (N, M) tensor becomes (N,). "
                "Matrix multiplication and broadcasting then see a different rank than the "
                "code assumes."
            ),
            (
                "Keep the axis when the shape matters: use [:, i:i+1] or .unsqueeze(1) "
                "instead of [:, i]."
            ),
            (
                "# Keep the column axis:\n# instead of: w_col = weights[:, 0]\n"
                "# use:        w_col = weights[:, 0:1]"
            ),
        )
    if has_runtime:
        return (
            "Your log names the failing operation. Compare the shapes of its two inputs.",
            (
                "Most PyTorch shape errors are one of: incompatible inner dimensions in "
                "matmul, a rank mismatch in broadcasting, or a device/dtype difference."
            ),
            (
                "Print both operands immediately before the failing line and compare their "
                "shapes against what the operation requires."
            ),
            None,
        )
    if has_log:
        return (
            (
                "Read the innermost frame of your traceback: that is where the error is "
                "raised."
            ),
            (
                "The exception type tells you which assumption broke; the line tells you "
                "where."
            ),
            "Add a print of the involved tensors' shape and dtype just before that line.",
            None,
        )
    return (
        "No static hazard was found in the uploaded text.",
        "Static analysis cannot see runtime shapes, dtypes or device placement.",
        "Run the script locally and upload the log if anything fails.",
        None,
    )


@router.post(
    "/submissions/{submission_id}/review",
    response_model=CodeReviewOut,
    status_code=201,
    dependencies=MUTATION,
)
def trigger_submission_review(
    submission_id: int,
    session: Db,
    use_llm: bool = Query(False),
):
    submission = _submission_or_404(session, submission_id)
    project_id = submission.project_id

    code_findings, log_findings, findings = _static_review(submission)
    summary = _default_summary(code_findings, log_findings)
    hint_1, hint_2, hint_3, solution = _hint_ladder(findings, bool(log_findings))
    llm_status = "skipped"
    model_name = "static_ast"

    if use_llm:
        # The metered call writes its own row from a separate session, so this request
        # must not be holding a SQLite transaction while it runs.
        context = build_context(submission)
        session.rollback()
        try:
            model_review = review_with_model(context, findings)
        except CostLimitExceeded as exc:
            raise _cost_limit(exc) from exc
        except Exception:
            logger.warning(
                "code_review_model_unavailable submission_id=%s", submission_id, exc_info=True
            )
            model_review = None
            llm_status = "unavailable"
        if model_review is not None:
            llm_status = "used"
            model_name = "static_ast+llm"
            findings = merge_findings(findings, model_review.findings)
            summary = model_review.summary
            hint_1 = model_review.hint_level_1 or hint_1
            hint_2 = model_review.hint_level_2 or hint_2
            hint_3 = model_review.hint_level_3 or hint_3
            solution = model_review.reference_solution or solution
        else:
            # Either the call failed or the model answered something that is not the
            # contract; both mean the learner is looking at a static-only review.
            llm_status = "unavailable"

    # The write lock is taken last: everything above is analysis, and holding the lock
    # across a model call would block the metering write.
    writable_project(session, project_id)
    submission = _submission_or_404(session, submission_id)

    review = CodeReview(
        submission_id=submission.id,
        summary=summary,
        findings=_serialize(findings),
        hint_level_1=hint_1,
        hint_level_2=hint_2,
        hint_level_3=hint_3,
        reference_solution=solution,
        solution_label="ai_generated_unverified" if solution else None,
        hints_revealed=1,
        llm_status=llm_status,
        model=model_name,
    )
    session.add(review)
    submission.status = "reviewed"
    session.commit()
    session.refresh(review)
    logger.info(
        "submission_reviewed submission_id=%s review_id=%s llm_status=%s findings=%s",
        submission.id,
        review.id,
        llm_status,
        len(findings),
    )
    return review


def _serialize(findings) -> list[dict]:
    """Static findings arrive as dataclasses; model findings arrive as dicts."""
    return [item if isinstance(item, dict) else item.to_dict() for item in findings]


def _default_summary(code_findings, log_findings) -> str:
    parts = []
    if any(f.category == "syntax_error" for f in code_findings):
        parts.append("The uploaded file does not parse, so nothing after that point was analysed.")
    elif code_findings:
        parts.append(
            f"Static analysis found {len(code_findings)} hazard(s) in the uploaded code."
        )
    else:
        parts.append("Static analysis found no provable hazard in the uploaded code.")
    if log_findings:
        parts.append(
            f"Your log reports {len(log_findings)} runtime symptom(s); they are recorded as "
            "your evidence, not as a result produced here."
        )
    else:
        parts.append("No log was uploaded, so runtime behaviour is unverified.")
    return " ".join(parts)


@router.post("/reviews/{review_id}/hints", response_model=HintOut, dependencies=MUTATION)
def reveal_hint(review_id: int, body: HintRequest, session: Db):
    review = _review_or_404(session, review_id)
    text = {1: review.hint_level_1, 2: review.hint_level_2, 3: review.hint_level_3}[
        body.level
    ]
    if not text:
        raise project_error(
            422, "hint_unavailable", f"Level {body.level} hint is not available for this review."
        )
    review.hints_revealed = max(review.hints_revealed or 1, body.level)
    session.commit()
    return HintOut(level=body.level, text=text, revealed=review.hints_revealed)


@router.post("/reviews/{review_id}/solution", response_model=SolutionOut, dependencies=MUTATION)
def reveal_solution(review_id: int, session: Db):
    review = _review_or_404(session, review_id)
    if not review.reference_solution:
        raise project_error(
            422, "solution_unavailable", "No reference solution is stored for this review."
        )
    if review.solution_revealed_at is None:
        review.solution_revealed_at = utcnow()
        session.commit()
        session.refresh(review)
    logger.info("review_solution_revealed review_id=%s", review.id)
    return SolutionOut(
        reference_solution=review.reference_solution,
        label="ai_generated_unverified",
        revealed_at=review.solution_revealed_at,
    )
