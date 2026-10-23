import hmac
import logging
import threading
import time
from collections import deque

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.auth import service
from app.auth.models import AuthSession
from app.db import SessionLocal

router = APIRouter(prefix="/auth", tags=["access"])
logger = logging.getLogger("studyforge.auth")
_attempts: deque[float] = deque()
_attempt_lock = threading.Lock()
# shortcut: process-local limiter for the single local worker; share it before adding workers.
LOGIN_LIMIT = 10
LOGIN_WINDOW = 60


def denied() -> HTTPException:
    return HTTPException(
        401, detail={"error": "authentication_required", "message": "Please sign in."}
    )


def set_access(response: Response, request: Request, session: AuthSession) -> None:
    response.set_cookie(
        service.ACCESS_COOKIE,
        service.access_token(session),
        max_age=min(service.ACCESS_SECONDS, session.expires_at - int(time.time())),
        httponly=True,
        samesite="lax",
        path="/",
        secure=request.url.scheme == "https"
        or request.headers.get("origin", "").startswith("https://"),
    )
    response.headers["Cache-Control"] = "no-store"


class LoginInput(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


@router.post("/login", status_code=204)
def login(body: LoginInput, request: Request, response: Response):
    with _attempt_lock:
        now = time.monotonic()
        while _attempts and _attempts[0] <= now - LOGIN_WINDOW:
            _attempts.popleft()
        if len(_attempts) >= LOGIN_LIMIT:
            logger.warning("auth.login rate_limited")
            raise HTTPException(
                429,
                detail={"error": "login_rate_limited", "message": "Try again in a minute."},
                headers={"Retry-After": str(LOGIN_WINDOW)},
            )
        _attempts.append(now)
    if not hmac.compare_digest(body.password.encode(), service.password().encode()):
        logger.warning("auth.login rejected")
        raise denied()
    session, refresh = service.new_session()
    set_access(response, request, session)
    response.set_cookie(
        service.REFRESH_COOKIE,
        refresh,
        max_age=service.REFRESH_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
        secure=request.url.scheme == "https"
        or request.headers.get("origin", "").startswith("https://"),
    )
    logger.info("auth.login accepted session=%s", session.id)


@router.post("/refresh", status_code=204)
def refresh(request: Request, response: Response):
    session = service.refresh_session(request.cookies.get(service.REFRESH_COOKIE))
    if session is None:
        raise denied()
    set_access(response, request, session)
    logger.info("auth.refresh accepted session=%s", session.id)


@router.post("/session", status_code=204)
def session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if not service.valid_access(request.cookies.get(service.ACCESS_COOKIE)):
        refresh(request, response)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    session = service.refresh_session(request.cookies.get(service.REFRESH_COOKIE))
    if session:
        with SessionLocal() as db:
            db.query(AuthSession).filter(AuthSession.id == session.id).delete()
            db.commit()
        logger.info("auth.logout accepted session=%s", session.id)
    for name in (service.ACCESS_COOKIE, service.REFRESH_COOKIE):
        response.delete_cookie(name, path="/", httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
