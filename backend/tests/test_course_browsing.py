from concurrent.futures import ThreadPoolExecutor

from app import models
from app.db import SessionLocal


def test_course_opens_are_atomic_and_reads_do_not_count(client):
    with SessionLocal() as db:
        course = models.Course(title="Browsing regression", description="Searchable")
        db.add(course)
        db.commit()
        course_id = course.id
    client.get(f"/courses/{course_id}")
    client.get("/courses")
    with SessionLocal() as db:
        # The column was added to existing databases as nullable, so an untouched
        # course reads back NULL rather than 0. Both mean "no opens yet"; the point
        # of this assertion is that GET /courses and GET /courses/{id} did not count.
        assert (db.get(models.Course, course_id).opened_count or 0) == 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.post(f"/api/courses/{course_id}/open"), range(8)))
    assert all(result.status_code == 200 for result in results)
    row = next(row for row in client.get("/courses").json() if row["id"] == course_id)
    assert row["opened_count"] == 8
    assert client.post("/api/courses/2147483647/open").status_code == 404
