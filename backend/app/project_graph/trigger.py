"""Auto-trigger project graph re-extraction when courses/chapters change."""

from app.jobs import service as jobs


def trigger_graph_extract(project_id: int) -> None:
    """Queue a background AI extraction job for the project's learning graph.

    Best-effort: never raises, so it can't break the caller's operation.
    """
    try:
        from app.project_graph.router import _run_extraction

        job = jobs.create_job(
            job_type="project_graph_extract",
            ref_type="project",
            ref_id=project_id,
        )
        jobs.run_in_background(_run_extraction, job.id, project_id)
    except Exception:
        pass
