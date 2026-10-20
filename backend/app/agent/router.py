import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.agent.models import AgentMessage, AgentSession
from app.agent.practice import draft_practice
from app.agent.prompt import EXPLORE_SYSTEM, build_prompt, parse_reply
from app.agent.retrieval import retrieve
from app.agent.schemas import (
    AskResult,
    MessageInput,
    MessageOut,
    PracticeInput,
    PracticeResult,
    SessionCreate,
    SessionDetail,
    SessionList,
    SessionOut,
)
from app.llm import get_provider
from app.metering import CostLimitExceeded, MeteredLLM, cost_limit_detail
from app.models import utcnow
from app.projects.service import (
    get_project,
    local_mutation,
    project_error,
    project_session,
    writable_project,
)
from app.submissions.models import VariantExercise
from app.submissions.schemas import VariantOut

logger = logging.getLogger("studyforge.agent")

EXPLORE_STAGE = "explore"
MAX_SQLITE_INTEGER = 2_147_483_647
MAX_HISTORY_TURNS = 6

router = APIRouter(prefix="/api", tags=["agent"])
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]


def _cost_limit(exc: CostLimitExceeded) -> Exception:
    # One body for every metered surface; metering.cost_limit_detail owns its shape.
    return HTTPException(402, detail=cost_limit_detail(exc))


def _session_or_404(session: Session, session_id: int) -> AgentSession:
    row = session.get(AgentSession, session_id)
    if row is None:
        raise project_error(404, "session_not_found", "Session not found.")
    return row


def _session_out(row: AgentSession) -> SessionOut:
    return SessionOut(
        id=row.id,
        project_id=row.project_id,
        mode=row.mode,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
        message_count=len(row.messages),
    )


@router.get("/projects/{project_id}/sessions", response_model=SessionList)
def list_sessions(
    project_id: int,
    session: Db,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=MAX_SQLITE_INTEGER),
):
    get_project(session, project_id)
    query = session.query(AgentSession).filter(AgentSession.project_id == project_id)
    total = query.count()
    rows = (
        query.options(selectinload(AgentSession.messages))
        .order_by(AgentSession.updated_at.desc(), AgentSession.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return SessionList(items=[_session_out(row) for row in rows], total=total)


@router.post(
    "/projects/{project_id}/sessions",
    response_model=SessionOut,
    status_code=201,
    dependencies=MUTATION,
)
def create_session(project_id: int, body: SessionCreate, session: Db):
    writable_project(session, project_id)
    row = AgentSession(project_id=project_id, mode=body.mode, title=body.title)
    session.add(row)
    session.commit()
    session.refresh(row)
    logger.info("agent_session_created project_id=%s session_id=%s", project_id, row.id)
    return _session_out(row)


def _message_out(message: AgentMessage, exercises: dict[int, VariantExercise] | None = None) -> MessageOut:
    """One message, with its exercise resolved when the caller looked them up.

    Resolution happens here rather than as an ORM relationship because there is no
    foreign key to join on — see VariantExercise.session_id — and because a reader that
    did not ask for exercises should not pay for loading them.
    """
    out = MessageOut.model_validate(message)
    if message.exercise_id is not None and exercises:
        exercise = exercises.get(message.exercise_id)
        if exercise is not None:
            out.exercise = VariantOut.model_validate(exercise)
    return out


def _session_exercises(session: Session, session_id: int) -> dict[int, VariantExercise]:
    rows = session.query(VariantExercise).filter(VariantExercise.session_id == session_id).all()
    return {row.id: row for row in rows}


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def read_session(session_id: int, session: Db):
    row = _session_or_404(session, session_id)
    exercises = _session_exercises(session, session_id)
    return SessionDetail(
        **_session_out(row).model_dump(),
        messages=[_message_out(message, exercises) for message in row.messages],
    )


@router.delete("/sessions/{session_id}", status_code=204, dependencies=MUTATION)
def delete_session(session_id: int, session: Db):
    row = _session_or_404(session, session_id)
    writable_project(session, row.project_id)
    session.delete(row)
    session.commit()
    logger.info("agent_session_deleted session_id=%s", session_id)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=AskResult,
    status_code=201,
    dependencies=MUTATION,
)
def ask(session_id: int, body: MessageInput, session: Db):
    """Answer one free-exploration question against this project's own material.

    Nothing is stored until a usable answer exists: a failed call leaves the session
    exactly as it was, so a retry cannot leave a question with no answer behind it.
    """
    row = _session_or_404(session, session_id)
    project_id = row.project_id
    project = get_project(session, project_id)
    if project.status == "archived":
        raise project_error(409, "project_archived", "Archived projects are read-only.")

    question = body.body.strip()
    if not question:
        raise project_error(422, "empty_message", "Ask a question first.")

    history = [(message.role, message.body) for message in row.messages][-MAX_HISTORY_TURNS:]
    sources = retrieve(session, project_id, question)
    prompt = build_prompt(sources, history, question)

    # The metered call writes its own row from another session; this request must not
    # be holding a SQLite transaction while it runs.
    session.rollback()

    run_id = f"explore-{uuid.uuid4().hex[:12]}"
    provider = get_provider()
    try:
        raw = MeteredLLM(provider, run_id).generate(EXPLORE_STAGE, EXPLORE_SYSTEM, prompt)
    except CostLimitExceeded as exc:
        raise _cost_limit(exc) from exc
    except Exception:
        logger.warning("agent_model_unavailable session_id=%s", session_id, exc_info=True)
        raise project_error(
            502, "agent_unavailable", "The model did not answer. Your question was not saved."
        ) from None

    reply, dropped = parse_reply(raw, {source.marker for source in sources})
    if reply is None:
        logger.warning("agent_reply_unparseable session_id=%s run_id=%s", session_id, run_id)
        raise project_error(
            502, "agent_unavailable", "The model did not answer. Your question was not saved."
        )
    if dropped:
        logger.info("agent_citations_dropped session_id=%s markers=%s", session_id, dropped)

    refs = [
        {
            "marker": source.marker,
            "chunk_id": source.chunk_id,
            "resource_id": source.resource_id,
            "filename": source.filename,
            "locator": source.locator,
        }
        for source in sources
        if source.marker in reply.citations
    ]

    writable_project(session, project_id)
    row = _session_or_404(session, session_id)
    user_message = AgentMessage(session_id=row.id, role="user", body=question)
    assistant_message = AgentMessage(
        session_id=row.id,
        role="assistant",
        body=reply.answer,
        beyond=reply.beyond or None,
        check_question=reply.check or None,
        source_refs=refs,
        grounded=1 if refs else 0,
        model=provider.model,
        run_id=run_id,
    )
    session.add_all([user_message, assistant_message])
    row.updated_at = utcnow()
    if not row.title:
        row.title = question[:60]
    session.commit()
    session.refresh(user_message)
    session.refresh(assistant_message)
    logger.info(
        "agent_answered session_id=%s sources=%s cited=%s grounded=%s",
        row.id,
        len(sources),
        len(refs),
        bool(refs),
    )
    return AskResult(
        user=_message_out(user_message),
        assistant=_message_out(assistant_message),
    )


def _last_question(row: AgentSession) -> str:
    for message in reversed(row.messages):
        if message.role == "user":
            return message.body
    return ""


@router.post(
    "/sessions/{session_id}/practice",
    response_model=PracticeResult,
    status_code=201,
    dependencies=MUTATION,
)
def create_practice(session_id: int, body: PracticeInput, session: Db):
    """Explain the current question at length and hand back one small exercise.

    Two things are stored and one is not. The explanation is stored as an assistant
    message so the conversation shows it and its citations survive a reload; the exercise
    is stored as a draft so the learner can submit code against it. Nothing is stored when
    the call fails, and the question is NOT stored a second time — it is already in the
    conversation, and a duplicate would read as if the learner had asked twice.
    """
    row = _session_or_404(session, session_id)
    project_id = row.project_id
    project = get_project(session, project_id)
    if project.status == "archived":
        raise project_error(409, "project_archived", "Archived projects are read-only.")

    question = (body.body or _last_question(row)).strip()
    if not question:
        raise project_error(
            422, "nothing_to_practise", "Ask a question in this session before asking for practice."
        )

    sources = retrieve(session, project_id, question)
    # Release the read transaction before the metered call writes its own row.
    session.rollback()

    run_id = f"practice-{uuid.uuid4().hex[:12]}"
    provider = get_provider()
    try:
        draft = draft_practice(provider, sources, question, run_id)
    except CostLimitExceeded as exc:
        raise _cost_limit(exc) from exc
    except Exception:
        logger.warning("practice_model_unavailable session_id=%s", session_id, exc_info=True)
        raise project_error(
            502,
            "practice_unavailable",
            "The model did not return a usable practice set. Nothing was saved.",
        ) from None

    if draft is None:
        raise project_error(
            502,
            "practice_unavailable",
            "The model did not return a usable practice set. Nothing was saved.",
        )

    refs = [
        {
            "marker": source.marker,
            "chunk_id": source.chunk_id,
            "resource_id": source.resource_id,
            "filename": source.filename,
            "locator": source.locator,
        }
        for source in sources
        if f"[{source.marker}]" in draft.explanation
    ]

    writable_project(session, project_id)
    row = _session_or_404(session, session_id)
    exercise = VariantExercise(
        project_id=project_id,
        session_id=row.id,
        source_question=question,
        title=draft.title,
        prompt=draft.prompt,
        starter_code=draft.starter_code,
        acceptance=draft.acceptance,
        status="draft",
    )
    session.add(exercise)
    session.flush()
    message = AgentMessage(
        session_id=row.id,
        role="assistant",
        body=draft.explanation,
        beyond=draft.beyond or None,
        source_refs=refs,
        exercise_id=exercise.id,
        grounded=1 if refs else 0,
        model=provider.model,
        run_id=run_id,
    )
    session.add(message)
    row.updated_at = utcnow()
    session.commit()
    session.refresh(message)
    session.refresh(exercise)
    logger.info(
        "practice_created session_id=%s exercise_id=%s sources=%s cited=%s",
        row.id,
        exercise.id,
        len(sources),
        len(refs),
    )
    return PracticeResult(
        message=_message_out(message, {exercise.id: exercise}),
        exercise=VariantOut.model_validate(exercise),
    )
