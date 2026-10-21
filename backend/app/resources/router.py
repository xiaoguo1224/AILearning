import hashlib
import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.projects.service import (
    get_project,
    local_mutation,
    project_error,
    project_session,
    writable_project,
)
from app.resources.models import ProjectResource, Resource
from app.resources.parser import (
    parse_docx_chunks,
    parse_markdown_or_text_chunks,
    parse_pdf_chunks,
    parse_url_chunks,
)
from app.resources.schemas import (
    AddTextResourceInput,
    AddUrlResourceInput,
    ResourceDetail,
    ResourceOut,
    ResourceSearchResult,
)
from app.resources.service import (
    get_resource_file_path,
    remove_fts_resource,
    save_chunks_and_sync_fts,
    search_resources_fts,
)

logger = logging.getLogger("studyforge.resources")

router = APIRouter(prefix="/api", tags=["resources"])
Db = Annotated[Session, Depends(project_session)]
MUTATION = [Depends(local_mutation)]
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB

ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
}


@router.get("/projects/{project_id}/resources", response_model=list[ResourceOut])
def list_project_resources(project_id: int, session: Db):
    get_project(session, project_id)
    links = (
        session.query(Resource)
        .join(ProjectResource, ProjectResource.resource_id == Resource.id)
        .filter(ProjectResource.project_id == project_id)
        .order_by(Resource.id.desc())
        .all()
    )
    return links


@router.post(
    "/projects/{project_id}/resources/upload",
    response_model=ResourceDetail,
    status_code=201,
    dependencies=MUTATION,
)
async def upload_resource(
    project_id: int, session: Db, file: UploadFile = File(...)
):
    project = writable_project(session, project_id)
    filename = Path(file.filename or "unknown").name
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise project_error(
            422,
            "unsupported_file_type",
            f"Unsupported file extension: {ext}. Allowed: {list(ALLOWED_EXTENSIONS.keys())}",
        )

    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise project_error(
            422, "file_too_large", f"File exceeds maximum allowed size of {MAX_FILE_BYTES} bytes"
        )
    if not data:
        raise project_error(422, "empty_file", "File is empty")

    sha256 = hashlib.sha256(data).hexdigest()
    kind = ALLOWED_EXTENSIONS[ext]
    target_path = get_resource_file_path(sha256, ext)
    if not target_path.exists():
        target_path.write_bytes(data)

    # Check if resource already exists by sha256
    resource = session.query(Resource).filter_by(sha256=sha256).first()
    if not resource:
        resource = Resource(
            filename=filename,
            kind=kind,
            path=str(target_path),
            sha256=sha256,
            parse_status="pending",
        )
        session.add(resource)
        session.flush()

        try:
            if kind == "pdf":
                chunks = parse_pdf_chunks(data)
            elif kind == "docx":
                chunks = parse_docx_chunks(data)
            else:
                chunks = parse_markdown_or_text_chunks(data.decode("utf-8", errors="replace"))

            save_chunks_and_sync_fts(session, resource, chunks)
            resource.parse_status = "completed"
        except (OSError, ValueError, RuntimeError, Exception) as exc:  # noqa: BLE001
            logger.error("Failed to parse resource %s: %s", resource.id, exc)
            resource.parse_status = "failed"
            resource.error_message = str(exc)
        session.commit()

    # Link to project if not already linked
    pr_link = (
        session.query(ProjectResource)
        .filter_by(project_id=project.id, resource_id=resource.id)
        .first()
    )
    if not pr_link:
        pr_link = ProjectResource(project_id=project.id, resource_id=resource.id)
        session.add(pr_link)
        session.commit()

    return resource


@router.post(
    "/projects/{project_id}/resources/url",
    response_model=ResourceDetail,
    status_code=201,
    dependencies=MUTATION,
)
def add_url_resource(project_id: int, body: AddUrlResourceInput, session: Db):
    project = writable_project(session, project_id)
    url = body.url.strip()
    title = body.title.strip() if body.title else url

    resource = Resource(
        filename=title,
        kind="url",
        source_url=url,
        parse_status="pending",
    )
    session.add(resource)
    session.flush()

    try:
        chunks = parse_url_chunks(url)
        save_chunks_and_sync_fts(session, resource, chunks)
        resource.parse_status = "completed"
    except (OSError, ValueError, RuntimeError, Exception) as exc:  # noqa: BLE001
        logger.error("Failed to parse URL resource %s: %s", resource.id, exc)
        resource.parse_status = "failed"
        resource.error_message = str(exc)

    session.add(ProjectResource(project_id=project.id, resource_id=resource.id))
    session.commit()
    return resource


@router.post(
    "/projects/{project_id}/resources/text",
    response_model=ResourceDetail,
    status_code=201,
    dependencies=MUTATION,
)
def add_text_resource(project_id: int, body: AddTextResourceInput, session: Db):
    project = writable_project(session, project_id)
    raw_bytes = body.content.encode("utf-8")
    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    ext = ".md" if body.kind == "markdown" else ".txt"
    target_path = get_resource_file_path(sha256, ext)
    if not target_path.exists():
        target_path.write_bytes(raw_bytes)

    resource = Resource(
        filename=body.title.strip(),
        kind=body.kind,
        path=str(target_path),
        sha256=sha256,
        parse_status="pending",
    )
    session.add(resource)
    session.flush()

    try:
        chunks = parse_markdown_or_text_chunks(body.content)
        save_chunks_and_sync_fts(session, resource, chunks)
        resource.parse_status = "completed"
    except (OSError, ValueError, RuntimeError, Exception) as exc:  # noqa: BLE001
        logger.error("Failed to parse text resource %s: %s", resource.id, exc)
        resource.parse_status = "failed"
        resource.error_message = str(exc)

    session.add(ProjectResource(project_id=project.id, resource_id=resource.id))
    session.commit()
    return resource


@router.get("/resources/{resource_id}", response_model=ResourceDetail)
def get_resource(resource_id: int, session: Db):
    res = session.get(Resource, resource_id)
    if not res:
        raise project_error(404, "resource_not_found", "Resource not found.")
    return res


@router.get("/resources/{resource_id}/file")
def download_resource_file(resource_id: int, session: Db):
    res = session.get(Resource, resource_id)
    if not res:
        raise project_error(404, "resource_not_found", "Resource not found.")
    if not res.path or not Path(res.path).exists():
        raise project_error(404, "file_not_found", "Resource file does not exist on disk.")
    return FileResponse(res.path, filename=res.filename)


@router.delete(
    "/projects/{project_id}/resources/{resource_id}", status_code=200, dependencies=MUTATION
)
def unlink_or_delete_resource(project_id: int, resource_id: int, session: Db):
    project = writable_project(session, project_id)
    res = session.get(Resource, resource_id)
    if not res:
        raise project_error(404, "resource_not_found", "Resource not found.")

    pr_link = (
        session.query(ProjectResource)
        .filter_by(project_id=project.id, resource_id=resource_id)
        .first()
    )
    if not pr_link:
        raise project_error(
            404, "resource_not_in_project", "Resource is not linked to this project."
        )

    session.delete(pr_link)
    session.flush()

    # Check remaining references across all projects
    remaining = session.query(ProjectResource).filter_by(resource_id=resource_id).count()
    deleted_permanently = False
    if remaining == 0:
        # No more projects reference this resource, clean up chunks and FTS
        remove_fts_resource(session, resource_id)
        if res.path and Path(res.path).exists():
            try:
                Path(res.path).unlink(missing_ok=True)
            except OSError as e:
                logger.warning("Could not delete file %s: %s", res.path, e)
        session.delete(res)
        deleted_permanently = True

    session.commit()
    return {
        "status": "success",
        "resource_id": resource_id,
        "deleted_permanently": deleted_permanently,
    }


@router.get("/projects/{project_id}/resources/search", response_model=list[ResourceSearchResult])
def search_project_resources(
    project_id: int, session: Db, q: str = Query(..., min_length=1)
):
    get_project(session, project_id)
    return search_resources_fts(session, q, project_id=project_id)
