import hashlib
import hmac
import os
import secrets
import time

from app.auth.models import AuthSession
from app.db import SessionLocal

ACCESS_COOKIE = "studyforge_access"
REFRESH_COOKIE = "studyforge_refresh"
ACCESS_SECONDS = 15 * 60
REFRESH_SECONDS = 7 * 24 * 60 * 60


def password() -> str:
    return os.environ.get("ADMIN_PWD", "")


def digest(value: str) -> str:
    # Changing the configured password invalidates both kinds of existing token.
    return hmac.new(password().encode(), value.encode(), hashlib.sha256).hexdigest()


def access_token(session: AuthSession) -> str:
    payload = f"{session.id}.{min(int(time.time()) + ACCESS_SECONDS, session.expires_at)}"
    return f"{payload}.{digest('access:' + payload)}"


def valid_access(token: str | None) -> bool:
    if not token or not password() or len(token) > 256:
        return False
    try:
        sid, expiry, signature = token.split(".")
        if int(expiry) <= time.time():
            return False
        if not hmac.compare_digest(signature, digest(f"access:{sid}.{expiry}")):
            return False
    except (ValueError, UnicodeError, TypeError):
        return False
    with SessionLocal() as db:
        session = db.get(AuthSession, sid)
        return session is not None and session.expires_at > time.time()


def new_session() -> tuple[AuthSession, str]:
    refresh = secrets.token_urlsafe(48)
    now = int(time.time())
    session = AuthSession(
        id=secrets.token_hex(24),
        refresh_hash=digest("refresh:" + refresh),
        created_at=now,
        expires_at=now + REFRESH_SECONDS,
    )
    with SessionLocal() as db:
        db.query(AuthSession).filter(AuthSession.expires_at <= now).delete()
        db.add(session)
        db.commit()
        db.refresh(session)
        db.expunge(session)
    return session, refresh


def refresh_session(token: str | None) -> AuthSession | None:
    if not token or len(token) > 256:
        return None
    with SessionLocal() as db:
        return (
            db.query(AuthSession)
            .filter(
                AuthSession.refresh_hash == digest("refresh:" + token),
                AuthSession.expires_at > time.time(),
            )
            .first()
        )
