import hashlib
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.metering import CostLimitExceeded, cost_limit_detail
from app.models import utcnow
from app.projects.service import (
    get_project,
    local_mutation,
    project_error,
    project_session,
    writable_project,
)
from app.submissions.llm_review import build_context, merge_findings, review_with_model
from app.submissions.llm_variant import draft_variant
from app.submissions.models import (
    CodeReview,
    Submission,
    SubmissionArtifact,
    VariantExercise,
)
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
    VariantList,
    VariantOut,
)
from app.submissions.service import (
    build_submission,
    file_artifact,
    privacy_warnings,
    text_artifacts,
    zip_artifacts,
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
    # One body for every metered surface; metering.cost_limit_detail owns its shape.
    return HTTPException(402, detail=cost_limit_detail(exc))


def _submission_or_404(session: Session, submission_id: int) -> Submission:
    submission = session.get(Submission, submission_id)
    if submission is None:
        raise project_error(404, "submission_not_found", "Submission not found.")
    return submission


MAX_SQLITE_INTEGER = 2_147_483_647


def _form_variant_id(raw: str) -> int | None:
    value = (raw or "").strip()
    if not value:
        return None
    if not value.isdigit() or not 0 < int(value) <= MAX_SQLITE_INTEGER:
        raise project_error(422, "invalid_variant", "variant_id must be a positive integer.")
    return int(value)


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
        quiz_item_id=submission.quiz_item_id,
        exercise_id=submission.exercise_id,
        version=submission.version,
        user_note=submission.user_note,
        variant_id=submission.variant_id,
        status=submission.status,
        created_at=submission.created_at,
        artifacts=artifacts,
        reviews=[CodeReviewOut.model_validate(review) for review in submission.reviews],
        privacy_warnings=privacy_warnings(submission),
    )


def _summary(submission: Submission) -> SubmissionSummaryOut:
    latest = submission.reviews[0] if submission.reviews else None
    quiz_course_id = None
    if submission.quiz_item_id:
        from app import models as m
        # Resolve via session bound to the submission.
        from sqlalchemy import inspect
        session = inspect(submission).session
        if session is not None:
            quiz_item = session.get(m.QuizItem, submission.quiz_item_id)
            if quiz_item:
                lesson = session.get(m.Lesson, quiz_item.lesson_id)
                if lesson:
                    module = session.get(m.Module, lesson.module_id)
                    if module:
                        quiz_course_id = module.course_id
    return SubmissionSummaryOut(
        id=submission.id,
        project_id=submission.project_id,
        quiz_item_id=submission.quiz_item_id,
        quiz_course_id=quiz_course_id,
        exercise_id=submission.exercise_id,
        version=submission.version,
        status=submission.status,
        user_note=submission.user_note,
        variant_id=submission.variant_id,
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


class QuestionSubmissionInput(BaseModel):
    """Code answering one quiz question. The question IS the exercise, so no
    exercise_id and no project — but the full submission shape otherwise:
    pasted code plus an optional run log, like the project form."""

    model_config = {"extra": "forbid"}

    code: str | None = Field(default=None, max_length=200_000)
    code_filename: str = Field(default="answer.py", max_length=200)
    log_content: str | None = Field(default=None, max_length=200_000)
    log_filename: str = Field(default="run.log", max_length=200)
    user_note: str | None = Field(default=None, max_length=2000)


@router.post(
    "/quiz/{item_id}/submissions",
    response_model=SubmissionDetail,
    status_code=201,
)
def create_question_submission(item_id: int, body: QuestionSubmissionInput, session: Db):
    """Submit code answering one code question.

    The submission is scoped to the question (project_id NULL, quiz_item_id set):
    it is an answer, not a free-floating project upload. Versions count per
    question, so re-submitting creates v2, v3, ... of this question's answers.
    """
    from app.models import QuizItem

    item = session.get(QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    if item.kind != "code":
        raise HTTPException(422, "Only code questions accept code submissions")

    artifacts = text_artifacts(
        code_filename=body.code_filename or "answer.py",
        code_content=body.code,
        log_filename=body.log_filename or "run.log",
        log_content=body.log_content,
    )
    if not artifacts:
        raise HTTPException(422, "Provide code, a log, or both.")

    latest = (
        session.query(Submission.version)
        .filter_by(quiz_item_id=item_id)
        .order_by(Submission.version.desc())
        .first()
    )
    version = (latest[0] + 1) if latest else 1

    submission = Submission(
        project_id=None,
        quiz_item_id=item_id,
        exercise_id=None,
        version=version,
        user_note=(body.user_note or "").strip() or None,
        status="submitted",
    )
    session.add(submission)
    session.flush()
    for filename, kind, content in artifacts:
        session.add(
            SubmissionArtifact(
                submission_id=submission.id,
                filename=filename,
                kind=kind,
                content=content,
                size_bytes=len(content.encode("utf-8")),
                sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            )
        )
    session.commit()
    session.refresh(submission)
    logger.info(
        "question_submission_created item_id=%s submission_id=%s version=%s",
        item_id,
        submission.id,
        version,
    )
    return _detail(session, submission)


@router.post(
    "/quiz/{item_id}/submissions/upload",
    response_model=SubmissionDetail,
    status_code=201,
)
async def upload_question_submission(
    item_id: int,
    session: Db,
    code_file: UploadFile | None = File(None),
    log_file: UploadFile | None = File(None),
    user_note: str = "",
):
    """Upload code and/or a run log answering one code question.

    Mirrors the project upload (single code file or .zip, plus log file) but
    scoped to the question: project_id NULL, version counted per question.
    """
    from app.models import QuizItem

    item = session.get(QuizItem, item_id)
    if not item:
        raise HTTPException(404, "Quiz item not found")
    if item.kind != "code":
        raise HTTPException(422, "Only code questions accept code submissions")

    artifacts: list[tuple[str, str, str]] = []
    if code_file is not None and code_file.filename:
        raw = await code_file.read()
        if Path(code_file.filename).suffix.lower() == ".zip":
            artifacts.extend(zip_artifacts(raw, code_file.filename))
        else:
            artifacts.append(file_artifact(raw, code_file.filename, "code"))
    if log_file is not None and log_file.filename:
        artifacts.append(file_artifact(await log_file.read(), log_file.filename, "log"))
    if not artifacts:
        raise HTTPException(422, "Provide code, a log, or both.")

    latest = (
        session.query(Submission.version)
        .filter_by(quiz_item_id=item_id)
        .order_by(Submission.version.desc())
        .first()
    )
    version = (latest[0] + 1) if latest else 1

    submission = Submission(
        project_id=None,
        quiz_item_id=item_id,
        exercise_id=None,
        version=version,
        user_note=user_note.strip() or None,
        status="submitted",
    )
    session.add(submission)
    session.flush()
    for filename, kind, content in artifacts:
        session.add(
            SubmissionArtifact(
                submission_id=submission.id,
                filename=filename,
                kind=kind,
                content=content,
                size_bytes=len(content.encode("utf-8")),
                sha256=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            )
        )
    session.commit()
    session.refresh(submission)
    logger.info(
        "question_submission_uploaded item_id=%s submission_id=%s version=%s artifacts=%s",
        item_id,
        submission.id,
        version,
        len(artifacts),
    )
    return _detail(session, submission)


@router.get("/quiz/{item_id}/submissions", response_model=SubmissionList)
def list_question_submissions(
    item_id: int,
    session: Db,
    limit: int = Query(default=50, le=200),
):
    """Version history of code submitted for one question, newest first."""
    from app.models import QuizItem

    if not session.get(QuizItem, item_id):
        raise HTTPException(404, "Quiz item not found")
    query = (
        session.query(Submission)
        .filter(Submission.quiz_item_id == item_id)
        .order_by(Submission.version.desc())
        .limit(limit)
    )
    items = [_summary(s) for s in query.all()]
    return {"items": items, "total": len(items)}


@router.get("/projects/{project_id}/submissions", response_model=SubmissionList)
def list_project_submissions(
    project_id: int,
    session: Db,
    exercise_id: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=2_147_483_647),
):
    from app import models as m
    from app.projects.models import ProjectCourse

    get_project(session, project_id)
    # Project-scoped submissions.
    project_query = session.query(Submission).filter(Submission.project_id == project_id)
    # Quiz-question submissions from all courses in this project.
    course_ids = [
        r[0]
        for r in session.query(ProjectCourse.course_id)
        .filter_by(project_id=project_id)
        .all()
    ]
    quiz_item_ids: list[int] = []
    if course_ids:
        # QuizItem -> Lesson -> Module -> Course
        quiz_item_ids = [
            r[0]
            for r in session.query(m.QuizItem.id)
            .join(m.Lesson, m.QuizItem.lesson_id == m.Lesson.id)
            .join(m.Module, m.Lesson.module_id == m.Module.id)
            .filter(m.Module.course_id.in_(course_ids))
            .all()
        ]
    if quiz_item_ids:
        query = session.query(Submission).filter(
            (Submission.project_id == project_id)
            | (Submission.quiz_item_id.in_(quiz_item_ids))
        )
    else:
        query = project_query
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
        variant_id=body.variant_id,
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
    variant_id: str = "",
):
    project = writable_project(session, project_id)
    artifacts: list[tuple[str, str, str]] = []
    if code_file is not None and code_file.filename:
        raw = await code_file.read()
        if Path(code_file.filename).suffix.lower() == ".zip":
            artifacts.extend(zip_artifacts(raw, code_file.filename))
        else:
            artifacts.append(file_artifact(raw, code_file.filename, "code"))
    if log_file is not None and log_file.filename:
        artifacts.append(file_artifact(await log_file.read(), log_file.filename, "log"))
    submission = build_submission(
        session,
        project,
        exercise_id=exercise_id or None,
        user_note=user_note or None,
        artifacts=artifacts,
        variant_id=_form_variant_id(variant_id),
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
    if submission.project_id is not None:
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
        # Provenance (P5-02 audit, 2026-10-21):
        # - scalar-index-removes-axis / slice-keeps-axis: D2L 2.1.4 索引和切片
        #   (X[-1] -> (4,), X[1:3] -> (2,4)). 原文事实.
        # - .unsqueeze(1) semantics: PyTorch official docs ("dimension of size one
        #   inserted at the specified position"); not covered by D2L 2.1. AI 扩展.
        # - "does not repair incompatible matmul inner dimensions": D2L 2.3.9
        #   (A in R^{n x k}, B in R^{k x m}). 原文事实.
        return (
            "Inspect the indexing expressions that use a bare integer on the second axis.",
            (
                "Indexing with a scalar removes that axis: a (N, M) tensor becomes (N,). "
                "Matrix multiplication and broadcasting then see a different rank than the "
                "code assumes."
            ),
            (
                "First decide whether a vector or column matrix is intended. For a column, "
                "apply .unsqueeze(1) to the selected vector, or use a slice for a non-negative "
                "index. This does not repair incompatible matmul inner dimensions."
            ),
            # Provenance (P5-02 audit, 2026-10-21): [:, 0:1] keeps the axis per
            # D2L 2.1.4; matrix @ vector validity per D2L 2.3.8 (torch.mv);
            # "equivalent column values" via .unsqueeze(1) per PyTorch docs.
            # The snippet itself stays labelled as not server-executed.
            (
                "# Conditional reference: weights must be a 2-D tensor and a column is intended.\n"
                "# A matrix @ vector is also valid when a vector output is intended.\n"
                "w_col = weights[:, 0:1]\n"
                "# Equivalent column values: weights[:, 0].unsqueeze(1)\n"
                "# Check inner dimensions, expected output, dtype and device locally.\n"
                "# This snippet was not executed by the server."
            ),
        )
    if has_runtime:
        # Provenance (P5-02 audit, 2026-10-21): the three-way breakdown below is a
        # developer-authored teaching heuristic (AI 扩展), not a textbook formula.
        # Its components are textbook-backed: matmul inner-dimension requirement
        # (D2L 2.3.9), broadcasting along length-1 axes (D2L 2.1.3).
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
                "No recognized failure was found in the uploaded log. Inspect the expected "
                "output shapes and values locally."
            ),
            (
                "A log without recognized errors is user-provided evidence, not a correctness proof."
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
    "/submissions/{submission_id}/review/job",
    status_code=201,
    dependencies=MUTATION,
)
def trigger_review_job(submission_id: int, session: Db, use_llm: bool = Query(False)):
    """Run a submission review as a background job.

    Returns {job_id} immediately. On completion job.result holds the review
    {id, summary, finding_count}. Poll GET /api/jobs/{id}. Navigating away
    does NOT cancel it. use_llm=true includes the model review (slower).
    """
    from app.jobs.service import create_job, find_live_job, run_in_background

    submission = _submission_or_404(session, submission_id)
    job_type = "code_review_llm" if use_llm else "code_review"
    live = find_live_job(session, job_type, "submission", submission_id)
    if live:
        # A submission is immutable, so a review already in flight is the review this
        # request would produce. Join it rather than pay for it twice.
        return {"job_id": live.id, "resumed": True}
    job = create_job(session, job_type, ref_type="submission", ref_id=submission_id)

    def _run(job_id: str):
        from app.db import SessionLocal
        from app.jobs.models import Job as _Job
        from app.jobs.service import complete_job, fail_job, update_progress
        from app.metering import CostLimitExceeded, cost_limit_detail

        update_progress(job_id, {"stage": "reviewing"})
        with SessionLocal() as s:
            j = s.get(_Job, job_id)
            if j and j.status == "cancelled":
                return
            sub = _submission_or_404(s, submission_id)
            code_findings, log_findings, findings = _static_review(sub)
            has_log = any(a.kind == "log" for a in sub.artifacts)
            summary = _default_summary(code_findings, log_findings, has_log)
            hint_1, hint_2, hint_3, solution = _hint_ladder(findings, has_log)
            model_name = "static_ast"
            llm_status = "skipped"
            if use_llm:
                question = None
                if sub.quiz_item_id is not None:
                    from app.models import QuizItem

                    item = s.get(QuizItem, sub.quiz_item_id)
                    question = item.question if item else None
                context = build_context(sub, question=question)
                s.rollback()
                try:
                    model_review = review_with_model(context, findings)
                except CostLimitExceeded as exc:
                    fail_job(job_id, f"Cost limit exceeded: {cost_limit_detail(exc)}")
                    return
                except Exception as exc:
                    fail_job(job_id, f"Review failed: {exc}")
                    return
                if model_review is None:
                    fail_job(job_id, "The model did not return a usable review.")
                    return
                llm_status = "used"
                model_name = "static_ast+llm"
                findings = merge_findings(findings, model_review.findings)
                summary = model_review.summary
                hint_1 = model_review.hint_level_1 or hint_1
                hint_2 = model_review.hint_level_2 or hint_2
                hint_3 = model_review.hint_level_3 or hint_3
                if model_review.reference_solution:
                    solution = model_review.reference_solution
            from app.submissions.models import CodeReview

            # Re-fetch to avoid detached instance issues after rollback.
            sub = _submission_or_404(s, submission_id)
            review = CodeReview(
                submission_id=sub.id,
                summary=summary,
                findings=[f.__dict__ if hasattr(f, "__dict__") else f for f in findings],
                hint_level_1=hint_1,
                hint_level_2=hint_2,
                hint_level_3=hint_3,
                reference_solution=solution,
                model=model_name,
                llm_status=llm_status,
            )
            s.add(review)
            sub.status = "reviewed"
            s.commit()
            s.refresh(review)
            complete_job(
                job_id,
                {"id": review.id, "summary": review.summary, "finding_count": len(findings)},
            )

    run_in_background(job.id, _run)
    return {"job_id": job.id}


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
    has_log = any(artifact.kind == "log" for artifact in submission.artifacts)
    summary = _default_summary(code_findings, log_findings, has_log)
    hint_1, hint_2, hint_3, solution = _hint_ladder(findings, has_log)
    solution_label = "static_reference_unverified" if solution else None
    llm_status = "skipped"
    model_name = "static_ast"

    if use_llm:
        # The metered call writes its own row from a separate session, so this request
        # must not be holding a SQLite transaction while it runs.
        question = None
        if submission.quiz_item_id is not None:
            from app.models import QuizItem

            item = session.get(QuizItem, submission.quiz_item_id)
            question = item.question if item else None
        context = build_context(submission, question=question)
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
            if model_review.reference_solution:
                solution = model_review.reference_solution
                solution_label = "ai_generated_unverified"
        else:
            # Either the call failed or the model answered something that is not the
            # contract; both mean the learner is looking at a static-only review.
            llm_status = "unavailable"

    # The write lock is taken last: everything above is analysis, and holding the lock
    # across a model call would block the metering write. Question-scoped submissions
    # have no project, so there is nothing to lock.
    if project_id is not None:
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
        solution_label=solution_label,
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


def _default_summary(code_findings, log_findings, has_log: bool = False) -> str:
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
    elif has_log:
        parts.append("A log was uploaded, but no recognized runtime error was found; runtime correctness is unverified.")
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


@router.get("/projects/{project_id}/variants", response_model=VariantList)
def list_variants(
    project_id: int,
    session: Db,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=MAX_SQLITE_INTEGER),
):
    get_project(session, project_id)
    query = session.query(VariantExercise).filter(VariantExercise.project_id == project_id)
    total = query.count()
    rows = query.order_by(VariantExercise.id.desc()).offset(offset).limit(limit).all()
    return VariantList(items=[VariantOut.model_validate(row) for row in rows], total=total)


@router.post(
    "/submissions/{submission_id}/variant",
    response_model=VariantOut,
    status_code=201,
    dependencies=MUTATION,
)
def create_variant(submission_id: int, session: Db):
    """Draft a variant of this submission's exercise. Requires a model; no static fallback."""
    submission = _submission_or_404(session, submission_id)
    project_id = submission.project_id
    if get_project(session, project_id).status == "archived":
        raise project_error(409, "project_archived", "Archived projects are read-only.")

    _, _, findings = _static_review(submission)
    context = build_context(submission)
    # Release the read transaction before the metered call writes its own row.
    session.rollback()
    try:
        draft = draft_variant(context, findings)
    except CostLimitExceeded as exc:
        raise _cost_limit(exc) from exc
    except Exception:
        logger.warning("variant_model_unavailable submission_id=%s", submission_id, exc_info=True)
        draft = None

    if draft is None:
        raise project_error(
            502,
            "variant_unavailable",
            "The model did not return a usable variant. Try again, or write your own next variation.",
        )

    writable_project(session, project_id)
    variant = VariantExercise(
        project_id=project_id,
        source_submission_id=submission_id,
        title=draft.title,
        prompt=draft.prompt,
        starter_code=draft.starter_code,
        acceptance=draft.acceptance,
        status="draft",
    )
    session.add(variant)
    session.commit()
    session.refresh(variant)
    logger.info("variant_created submission_id=%s variant_id=%s", submission_id, variant.id)
    return variant
