"""Every AI request must be payable at most once.

A job is a model call the learner pays for. A double-click, a second tab, or a page
that re-sends its request must join the job already in flight instead of buying a
second copy of the same answer. Two shapes are covered here:

* in-flight joining — the guard `jobs.service.find_live_job` and the routes that use it;
* finished results — the reference solution (cached on the item) and the answer
  analysis (recorded on the job, one per attempt, because attempts are append-only).

The in-flight cases are set up by inserting a pending job directly. That is deliberate:
running a real job through the fake provider races the assertion (it may finish before
the second request arrives), and what is under test is the lookup, not the worker.
"""


def _seed_course(client, monkeypatch):
    from app import llm, main
    from app.llm.fake_provider import FakeProvider

    # Two patches, not one. `main.get_provider` covers the routes that were bound to
    # it at import time; `llm.get_provider` covers the workers that resolve it lazily
    # (`from app.llm import get_provider` inside the job body, as the hint job does).
    # Without the second one a test that only wants a job row still fires a real
    # model call in a pool thread that has two slots for the entire suite.
    monkeypatch.setattr(main, "get_provider", lambda: FakeProvider())
    monkeypatch.setattr(llm, "get_provider", lambda: FakeProvider())
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


def _pending_job(job_type, ref_type=None, ref_id=None, progress=None):
    from app.db import SessionLocal
    from app.jobs.service import create_job

    session = SessionLocal()
    try:
        return create_job(session, job_type, ref_type, ref_id, progress=progress).id
    finally:
        session.close()


def _jobs_of_type(job_type, ref_type=None, ref_id=None):
    """Jobs of one type, narrowed to one subject whenever the caller can name it.

    The filter is not tidiness. The whole suite shares one SQLite file, so an
    unfiltered count answers "how many jobs of this type has anything in this
    process ever created" — a number that changes when an unrelated file gains a
    test. `test_the_graph_trigger_does_not_stack_jobs` asserted a bare count of 1
    and read 4 as soon as another file created three projects; the guard it was
    written to protect was working the whole time.
    """
    from app.db import SessionLocal
    from app.jobs.models import Job

    session = SessionLocal()
    try:
        query = session.query(Job).filter(Job.type == job_type)
        if ref_type is not None:
            query = query.filter(Job.ref_type == ref_type)
        if ref_id is not None:
            query = query.filter(Job.ref_id == ref_id)
        return query.all()
    finally:
        session.close()


def _seed_attempt(lesson_id, item_id, answer="not the answer", attempt_no=1):
    """Record one answer without going through the grading route.

    The grading route hands its work to a two-thread pool. In a full run those
    threads can be occupied by a background job another file left behind, and the
    wait below then measures the pool, not the guard. What this file is about is
    the dedupe lookup, so the attempt is inserted and the job is completed by hand.
    """
    from app.attempts import LESSON_QUIZ_SOURCE
    from app.db import SessionLocal
    from app.models import Attempt

    session = SessionLocal()
    try:
        attempt = Attempt(
            quiz_item_id=item_id,
            lesson_id=lesson_id,
            concept_key="",
            concept_label="",
            submitted_answer=answer,
            expected_answer="a",
            correct=False,
            attempt_no=attempt_no,
            source=LESSON_QUIZ_SOURCE,
        )
        session.add(attempt)
        session.commit()
        return attempt.id
    finally:
        session.close()


def _no_worker(monkeypatch):
    """Keep the routes from spending a pool thread on the job they just queued.

    The routes import `run_in_background` inside the function body, so patching the
    service attribute is enough. Assertions here are about which job a request joins;
    a worker that also writes the result would race them.
    """
    from app.jobs import service as jobs_service

    monkeypatch.setattr(jobs_service, "run_in_background", lambda job_id, fn: None)


def test_a_second_solution_request_joins_the_one_in_flight(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    _, item = _first_item(client, course_id)
    running = _pending_job("quiz_solution", "quiz", item["id"])

    response = client.post(f"/api/quiz/{item['id']}/solution/job")
    assert response.status_code == 200, response.text
    assert response.json()["job_id"] == running
    assert len(_jobs_of_type("quiz_solution", "quiz", item["id"])) == 1


def test_a_second_question_generation_joins_the_one_in_flight(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    running = _pending_job("quiz_generate", "course", course_id)

    response = client.post(
        f"/api/courses/{course_id}/quiz/generate/job",
        json={"items": [{"kind": "mcq", "count": 1}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["job_id"] == running
    assert len(_jobs_of_type("quiz_generate", "course", course_id)) == 1


def test_a_second_course_generation_joins_the_one_in_flight(client, monkeypatch):
    baseline = len(_jobs_of_type("course_generate"))
    running = _pending_job("course_generate")
    response = client.post(
        "/courses/generate/job",
        json={"text": "transformer attention is all you need " * 60},
    )
    assert response.status_code == 200, response.text
    assert response.json()["job_id"] == running
    # course_generate carries no ref: it is one job for the whole install, so the
    # count is taken against the baseline rather than against 1.
    assert len(_jobs_of_type("course_generate")) == baseline + 1


def test_a_second_regeneration_joins_the_one_in_flight(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    lesson_id, _ = _first_item(client, course_id)
    running_lesson = _pending_job("lesson_regenerate", "lesson", lesson_id)
    running_course = _pending_job("course_regenerate", "course", course_id)

    lesson = client.post(f"/api/lessons/{lesson_id}/regenerate/job", json={"feedback": "x"})
    course = client.post(f"/api/courses/{course_id}/regenerate/job", json={"feedback": "x"})
    assert lesson.json()["job_id"] == running_lesson
    assert course.json()["job_id"] == running_course
    assert len(_jobs_of_type("lesson_regenerate", "lesson", lesson_id)) == 1
    assert len(_jobs_of_type("course_regenerate", "course", course_id)) == 1


def test_a_second_press_of_check_answer_joins_the_grading_in_flight(client, monkeypatch):
    course_id = _seed_course(client, monkeypatch)
    _, item = _first_item(client, course_id)
    running = _pending_job("quiz_grade", "quiz", item["id"])

    response = client.post(f"/quiz/{item['id']}/answer/job", json={"answer": "something"})
    assert response.status_code == 200, response.text
    assert response.json()["job_id"] == running
    assert len(_jobs_of_type("quiz_grade", "quiz", item["id"])) == 1


def test_hint_levels_do_not_share_a_job(client, monkeypatch):
    _no_worker(monkeypatch)
    course_id = _seed_course(client, monkeypatch)
    _, item = _first_item(client, course_id)
    running = _pending_job("quiz_hint", "quiz", item["id"], progress={"level": 1, "stage": "queued"})

    same_level = client.post(f"/quiz/{item['id']}/hints/job", json={"level": 1})
    assert same_level.json()["job_id"] == running

    # Level 2 is a different product; it must not be answered with the level 1 job.
    other_level = client.post(f"/quiz/{item['id']}/hints/job", json={"level": 2})
    assert other_level.json()["job_id"] != running
    assert len(_jobs_of_type("quiz_hint", "quiz", item["id"])) == 2


def test_answer_analysis_runs_once_per_attempt(client, monkeypatch):
    from app.jobs.service import complete_job

    _no_worker(monkeypatch)
    course_id = _seed_course(client, monkeypatch)
    lesson_id, item = _first_item(client, course_id)
    attempt_id = _seed_attempt(lesson_id, item["id"])
    url = f"/api/quiz/{item['id']}/answer-analysis/job"

    first = client.post(url, json={"attempt_id": attempt_id})
    assert first.status_code == 200, first.text
    job_id = first.json()["job_id"]

    # The window between queueing and the worker waking up is exactly when a
    # double-click arrives, so the attempt id is carried in `progress` from the
    # start. This request must join the job above, not queue a second one.
    second = client.post(url, json={"attempt_id": attempt_id})
    assert second.json()["job_id"] == job_id
    assert second.json().get("resumed") is True
    assert len(_jobs_of_type("quiz_answer_analysis", "quiz", item["id"])) == 1

    # `complete_job` clears `progress`, so a finished job records the attempt in
    # `result` instead. A guard that only read `progress` would fail right here.
    complete_job(job_id, {"item_id": item["id"], "attempt_id": attempt_id, "analysis": "Reviewed."})

    third = client.post(url, json={"attempt_id": attempt_id})
    assert third.json()["job_id"] == job_id
    assert third.json().get("cached") is True

    # The synchronous route reads the same record; it is not a way around the rule.
    sync = client.post(f"/api/quiz/{item['id']}/answer-analysis", json={"attempt_id": attempt_id})
    assert sync.status_code == 200, sync.text
    assert sync.json()["analysis"] == "Reviewed."
    assert sync.json().get("cached") is True
    assert len(_jobs_of_type("quiz_answer_analysis", "quiz", item["id"])) == 1


def test_the_graph_trigger_does_not_stack_jobs(client, monkeypatch):
    from app.db import SessionLocal
    from app.jobs.models import Job
    from app.project_graph.trigger import trigger_graph_extract

    # Same reason as above: three triggers, one job, and no pool thread spent
    # proving it — a project's extraction is a paid call nobody here is buying.
    _no_worker(monkeypatch)
    project = client.post("/api/projects", json={"name": "P", "goal": "", "mode": "course"})
    project_id = project.json()["id"]

    trigger_graph_extract(project_id)
    trigger_graph_extract(project_id)
    trigger_graph_extract(project_id)

    session = SessionLocal()
    try:
        rows = (
            session.query(Job)
            .filter(Job.type == "project_graph_extract", Job.ref_id == project_id)
            .all()
        )
        assert len(rows) == 1
    finally:
        session.close()
