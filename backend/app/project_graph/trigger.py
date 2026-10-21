"""Auto-trigger project graph re-extraction when courses/chapters change."""

from app.jobs import service as jobs


def trigger_graph_extract(project_id: int) -> None:
    """Queue a background AI extraction job for the project's learning graph.

    Best-effort: never raises, so it can't break the caller's operation.
    """
    try:
        from app.db import SessionLocal
        from app.project_graph.router import _run_extraction

        db = SessionLocal()
        try:
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
