"""Real middleware, cookies, persistence, and fixed seven-day expiry."""

import time

import pytest
from fastapi.testclient import TestClient

from app.auth import router, service
from app.auth.models import AuthSession
from app.db import SessionLocal
from app.main import app


@pytest.fixture
def anonymous():
    router._attempts.clear()
    with TestClient(app) as client:
        yield client


def login(client):
    return client.post("/auth/login", json={"password": service.password()})


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/courses"),
        ("GET", "/api/projects"),
        ("GET", "/usage"),
        ("GET", "/api/attachments/1"),
        ("GET", "/courses/1/plan.ics"),
        ("POST", "/courses/generate"),
        ("DELETE", "/courses/1"),
        ("GET", "/openapi.json"),
        ("GET", "/docs"),
        ("GET", "/redoc"),
    ],
)
def test_all_business_routes_require_access(anonymous, method, path):
    result = anonymous.request(method, path)
    assert result.status_code == 401
    assert result.json()["detail"]["error"] == "authentication_required"
    assert "no-store" in result.headers["cache-control"]


def test_password_cookie_and_persistent_session(anonymous):
    assert anonymous.get("/health").json() == {"status": "ok"}
    assert anonymous.post("/auth/login", json={"password": "wrong"}).status_code == 401
    result = login(anonymous)
    assert result.status_code == 204
    assert result.content == b""
    cookies = result.headers.get_list("set-cookie")
    assert all("HttpOnly" in value and "SameSite=lax" in value for value in cookies)
    assert any("Max-Age=604800" in value for value in cookies)
    assert all(service.password() not in value for value in cookies)
    assert anonymous.get("/courses").status_code == 200
    with TestClient(app) as restarted:
        restarted.cookies.update(anonymous.cookies)
        assert restarted.get("/api/projects").status_code == 200


def test_expired_access_refreshes_without_extending_seven_days(anonymous, monkeypatch):
    assert login(anonymous).status_code == 204
    refresh = anonymous.cookies[service.REFRESH_COOKIE]
    session = service.refresh_session(refresh)
    original_expiry = session.expires_at
    now = time.time()
    monkeypatch.setattr(service.time, "time", lambda: now + service.ACCESS_SECONDS + 1)
    assert anonymous.get("/courses").status_code == 401
    assert anonymous.post("/auth/session").status_code == 204
    assert anonymous.get("/courses").status_code == 200
    assert service.refresh_session(refresh).expires_at == original_expiry
    monkeypatch.setattr(service.time, "time", lambda: now + service.REFRESH_SECONDS + 1)
    assert anonymous.post("/auth/refresh").status_code == 401
    assert anonymous.get("/courses").status_code == 401


def test_refresh_is_not_an_access_token_and_logout_revokes_copied_tokens(anonymous):
    login(anonymous)
    copied = dict(anonymous.cookies)
    with TestClient(app) as attacker:
        attacker.cookies.set(service.ACCESS_COOKIE, copied[service.REFRESH_COOKIE])
        assert attacker.get("/courses").status_code == 401
        attacker.cookies.update(copied)
        assert attacker.get("/courses").status_code == 200
        assert anonymous.post("/auth/logout").status_code == 204
        assert attacker.get("/courses").status_code == 401
        assert attacker.post("/auth/refresh").status_code == 401
    assert not anonymous.cookies.get(service.ACCESS_COOKIE)
    assert not anonymous.cookies.get(service.REFRESH_COOKIE)


def test_tampered_tokens_and_password_change(anonymous, monkeypatch):
    login(anonymous)
    access = anonymous.cookies[service.ACCESS_COOKIE]
    assert not service.valid_access(access[:-1] + ("0" if access[-1] != "0" else "1"))
    for token in ("x", "a.b.c", "x" * 1000, "..", "s.9999999999.☃"):
        assert not service.valid_access(token)
    monkeypatch.setenv("ADMIN_PWD", "a-new-password")
    assert anonymous.get("/courses").status_code == 401
    assert anonymous.post("/auth/refresh").status_code == 401


@pytest.mark.parametrize(
    "path", ["/auth/login", "/auth/refresh", "/auth/logout", "/courses/generate"]
)
def test_cross_site_mutations_rejected(anonymous, path):
    assert (
        anonymous.post(
            path, headers={"origin": "https://evil.example"}, json={"password": service.password()}
        ).status_code
        == 403
    )
    assert anonymous.post(path, headers={"sec-fetch-site": "cross-site"}).status_code == 403


def test_limiter_and_unconfigured_fail_closed(anonymous, monkeypatch):
    for _ in range(router.LOGIN_LIMIT):
        assert anonymous.post("/auth/login", json={"password": "wrong"}).status_code == 401
    limited = login(anonymous)
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"
    monkeypatch.setenv("ADMIN_PWD", "")
    assert anonymous.get("/courses").status_code == 503
    assert login(anonymous).status_code == 503
    assert anonymous.get("/health").status_code == 200


def test_refresh_expiry_is_persisted(anonymous):
    login(anonymous)
    session = service.refresh_session(anonymous.cookies[service.REFRESH_COOKIE])
    with SessionLocal() as db:
        db.query(AuthSession).filter(AuthSession.id == session.id).update({"expires_at": 0})
        db.commit()
    assert anonymous.post("/auth/refresh").status_code == 401


def test_https_uses_secure_cookies(anonymous, monkeypatch):
    monkeypatch.setenv("STUDYFORGE_CORS_ORIGINS", "https://study.example")
    result = anonymous.post(
        "/auth/login",
        headers={"origin": "https://study.example"},
        json={"password": service.password()},
    )
    assert result.status_code == 204
    assert all("Secure" in c for c in result.headers.get_list("set-cookie"))
