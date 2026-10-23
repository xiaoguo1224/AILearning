"""Auto-trigger project graph re-extraction when courses/chapters change."""

from app.jobs import service as jobs


def trigger_graph_extract(project_id: int) -> None:
    """Queue a background AI extraction job for the project's learning graph.

    Best-effort: never raises, so it can't break the caller's operation.

    Idempotent by subject, not by call: this fires from project creation and from
    every course (un)link, so a page that re-sends one of those requests would
    otherwise stack a second extraction on top of a running one — a paid model call
    per extra trigger. An extraction already in flight is the extraction this call
    would start.
    """
    try:
        from app.db import SessionLocal
        from app.project_graph.router import _run_extraction

        db = SessionLocal()
        try:
            live = jobs.find_live_job(db, "project_graph_extract", "project", project_id)
            if live:
                return
            job = jobs.create_job(
                db,
                job_type="project_graph_extract",
                ref_type="project",
                ref_id=project_id,
            )
        finally:
            db.close()
        def _run(jid: str):
            _run_extraction(jid, project_id)
        jobs.run_in_background(job.id, _run)
    except Exception:
        pass
