// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { safeReturnPath } from "@/lib/auth";
import { GET, POST } from "@/app/backend/[...path]/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test.each(["/projects", "/courses/1?tab=quiz", "/usage", "/private.json"])("redirects anonymous page %s", async (path) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe(path);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["/api/sidebar-projects", "/backend/courses", "/backend/api/attachments/1"])("rejects anonymous API %s", async (path) => {
  expect((await proxy(new NextRequest(`http://localhost:3000${path}`))).status).toBe(401);
});

test.each(["/", "/login", "/backend/auth/login", "/backend/auth/refresh"])("allows the public entrance %s", async (path) => {
  expect((await proxy(new NextRequest(`http://localhost:3000${path}`))).headers.get("x-middleware-next")).toBe("1");
});

test("renews access before SSR, forwarding the new cookie to server and browser", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://backend:8000");
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { "Set-Cookie": "studyforge_access=new; Path=/; HttpOnly; SameSite=Lax" } }));
  vi.stubGlobal("fetch", fetch);
  const response = await proxy(new NextRequest("http://localhost:3000/projects", { headers: { cookie: "studyforge_refresh=existing" } }));
  expect(fetch).toHaveBeenCalledWith("http://backend:8000/auth/session", expect.objectContaining({ method: "POST", cache: "no-store" }));
  expect(response.headers.get("x-middleware-request-cookie")).toContain("studyforge_access=new");
  expect(response.headers.get("set-cookie")).toContain("studyforge_access=new");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test("rejects invalid tokens and fails closed on an offline auth service", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })).mockRejectedValueOnce(new Error("private path"));
  vi.stubGlobal("fetch", fetch);
  const request = () => new NextRequest("http://localhost:3000/projects", { headers: { cookie: "studyforge_access=forged" } });
  expect((await proxy(request())).status).toBe(307);
  const unavailable = await proxy(request());
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain("private path");
});

test.each(["https://evil.example", "//evil.example", "/\\evil", "/login?next=/login", "/api/projects"])("sanitizes return path %s", (path) => {
  expect(safeReturnPath(path)).toBe("/projects");
});

test("same-origin proxy preserves uploads, cookies, origin, and streaming response", async () => {
  vi.stubEnv("API_INTERNAL_URL", "http://backend:8000");
  const fetch = vi.fn().mockResolvedValue(new Response("event: done\n\n", { headers: { "Content-Type": "text/event-stream", "Set-Cookie": "studyforge_access=new; HttpOnly", "Content-Encoding": "gzip" } }));
  vi.stubGlobal("fetch", fetch);
  const request = new NextRequest("http://localhost:3000/backend/courses/generate/stream?q=1", {
    method: "POST", body: "input", headers: { cookie: "studyforge_access=existing", origin: "http://localhost:3000", "content-type": "application/json" },
  });
  const response = await POST(request);
  expect(fetch).toHaveBeenCalledWith("http://backend:8000/courses/generate/stream?q=1", expect.objectContaining({ body: request.body, redirect: "manual" }));
  const sent = fetch.mock.calls[0][1].headers as Headers;
  expect(sent.get("cookie")).toBe("studyforge_access=existing");
  expect(sent.get("origin")).toBe("http://localhost:3000");
  expect(response.headers.get("content-encoding")).toBeNull();
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(await response.text()).toBe("event: done\n\n");
});

test("upstream failures return a safe error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret upstream path")));
  const response = await GET(new NextRequest("http://localhost:3000/backend/courses"));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("secret");
});
