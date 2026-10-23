import os

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.auth.service import ACCESS_COOKIE, password, valid_access

PUBLIC = {"/health", "/auth/login", "/auth/session", "/auth/refresh", "/auth/logout"}


class AuthMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        error = None
        if request.url.path != "/health" and request.method != "OPTIONS":
            if not password():
                error = (503, "access_not_configured", "Workspace access is not configured.")
            elif request.method not in {"GET", "HEAD"}:
                origins = {
                    s.strip()
                    for s in os.environ.get(
                        "STUDYFORGE_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
                    ).split(",")
                }
                origin = request.headers.get("origin")
                if (origin and origin not in origins) or request.headers.get(
                    "sec-fetch-site"
                ) == "cross-site":
                    error = (403, "untrusted_origin", "This request origin is not allowed.")
            if (
                error is None
                and request.url.path not in PUBLIC
                and not await run_in_threadpool(valid_access, request.cookies.get(ACCESS_COOKIE))
            ):
                error = (401, "authentication_required", "Please sign in.")
        if error:
            status, code, message = error
            await JSONResponse(
                {"detail": {"error": code, "message": message}},
                status_code=status,
                headers={"Cache-Control": "no-store"},
            )(scope, receive, send)
            return

        async def private_send(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["Cache-Control"] = "private, no-store"
            await send(message)

        await self.app(scope, receive, private_send)
