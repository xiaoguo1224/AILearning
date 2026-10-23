import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { backendUrl } from "@/lib/backend-server";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/" || path === "/login" || /^\/backend\/auth\/(login|refresh|logout|session)$/.test(path)) {
    return NextResponse.next();
  }
  const api = path.startsWith("/backend/") || path.startsWith("/api/");
  function unauthenticated() {
    if (api) return NextResponse.json({ detail: { error: "authentication_required", message: "Please sign in." } }, { status: 401 });
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (!request.cookies.has(ACCESS_COOKIE) && !request.cookies.has(REFRESH_COOKIE)) return unauthenticated();
  try {
    const session = await fetch(backendUrl("/auth/session"), {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { cookie: request.headers.get("cookie") ?? "", origin: request.nextUrl.origin },
    });
    if (session.status === 401) return unauthenticated();
    if (!session.ok) return NextResponse.json({ error: "Access service unavailable." }, { status: 503 });
    const headers = new Headers(request.headers);
    const cookies = session.headers.getSetCookie();
    for (const cookie of cookies) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      request.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    headers.set("cookie", request.cookies.toString());
    const response = NextResponse.next({ request: { headers } });
    for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Access service unavailable." }, { status: 503 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico|icon.svg).*)"],
};
