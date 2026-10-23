"""Every finished job must carry the page that shows what it produced.

The jobs page used to offer "打开" only for course generation; a finished quiz job,
code review or knowledge-graph extraction left the learner with a row of JSON and no
way to reach the thing it was about. The link is resolved server-side because a job
stores only a ref ("quiz item 37"), and turning that into a course id takes two joins.
"""


def _seed_course(client, monkeypatch):
    from app import main
    from app.llm.fake_provider import FakeProvider

    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    response = client.post(
        "/courses/generate",
        json={"text": "transformer attention is all you need " * 60},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _first_item(client, course_id):
    bank = client.get(f"/api/courses/{course_id}/quiz").json()
    for module in bank["modules"]:
        for lesson in module["lessons"]:
            for item in lesson["items"]:
                return lesson["id"], item
    raise AssertionError("the fake provider seeded no questions")


def _add_job(**fields):
    from app.db import SessionLocal
    from app.jobs.models import Job

    session = SessionLocal()
    try:
        session.add(Job(**fields))
        session.commit()
    finally:
        session.close()


def _latest_job(client):
    return client.get("/api/jobs", params={"limit": 1}).json()["items"][0]


def test_course_generation_links_to_the_course_it_created(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    # The synchronous generation route returns the course and writes no job row; the
    # job route records the id in `result`, which is what the link is read from.
    _add_job(
        id="job-course-generate",
        type="course_generate",
        status="completed",
        result={"course_id": course_id},
    )

    job = client.get("/api/jobs/job-course-generate").json()
    assert job["href"] == f"/courses/{course_id}"


def test_a_question_job_links_to_the_course_bank(client, monkeypatch):
    from app.course_quiz import router as quiz_router
    from app.llm.fake_provider import FakeProvider

    # The job runs in its own thread and resolves the provider from this module.
    monkeypatch.setattr(quiz_router, "get_provider", lambda: FakeProvider())
    course_id = _seed_course(client, monkeypatch)
    _, item = _first_item(client, course_id)

    response = client.post(f"/api/quiz/{item['id']}/solution/job")
    assert response.status_code == 200, response.text

    job = _latest_job(client)
    assert job["type"] == "quiz_solution"
    assert job["ref_type"] == "quiz" and job["ref_id"] == item["id"]
    # Only code questions have their own page; a solution for anything else belongs
    # in the bank, which is where the question itself lives.
    expected = (
        f"/courses/{course_id}/quiz/{item['id']}"
        if item["kind"] == "code"
        else f"/courses/{course_id}/quiz"
    )
    assert job["href"] == expected


def test_a_lesson_job_links_through_the_module_to_its_course(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    lesson_id, _ = _first_item(client, course_id)

    response = client.post(
        f"/api/lessons/{lesson_id}/regenerate/job", json={"feedback": "shorter"}
    )
    assert response.status_code == 200, response.text

    job = _latest_job(client)
    assert job["ref_type"] == "lesson"
    assert job["href"] == f"/courses/{course_id}/lessons/{lesson_id}"


def test_a_job_whose_subject_is_gone_offers_nothing_to_open(client):
    """A deleted quiz item must not produce a link into a page that 404s."""
    _add_job(
        id="job-without-subject",
        type="quiz_solution",
        status="completed",
        ref_type="quiz",
        ref_id=999999,
    )

    assert client.get("/api/jobs/job-without-subject").json()["href"] is None


def test_job_timestamps_carry_the_utc_offset(client):
    """A stored timestamp is naive UTC, so it must leave the API stamped as UTC.

    The jobs list used to serialise `job.created_at.isoformat()` straight off a SQLite
    row, which drops tzinfo and produced "2026-10-23T07:04:36". A browser reads a string
    with no offset as LOCAL time, so a Beijing learner saw every job eight hours early —
    and the jobs page is the one screen where the time is the point.
    """
    _add_job(id="job-with-a-clock", type="quiz_solution", status="completed")

    job = client.get("/api/jobs/job-with-a-clock").json()

    assert job["created_at"].endswith("+00:00"), job["created_at"]
    assert job["updated_at"].endswith("+00:00"), job["updated_at"]
