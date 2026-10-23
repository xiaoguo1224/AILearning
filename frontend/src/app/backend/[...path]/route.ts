import { NextRequest } from "next/server";
import { backendUrl } from "@/lib/backend-server";

// A fixed upstream and a small header allowlist keep this from becoming an open proxy.
async function forward(request: NextRequest) {
  const path = request.nextUrl.pathname.slice("/backend".length);
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return Response.json({ error: "Invalid API path." }, { status: 400 });
  }
  const headers = new Headers();
  for (const name of ["cookie", "content-type", "accept", "accept-language", "origin", "sec-fetch-site"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(backendUrl(path + request.nextUrl.search), {
      method: request.method, headers, cache: "no-store", redirect: "manual",
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half", signal: request.signal,
    } as RequestInit & { duplex: string });
    const outgoing = new Headers(upstream.headers);
    for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection"]) outgoing.delete(name);
    outgoing.set("Cache-Control", "private, no-store");
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json({ detail: { error: "backend_unavailable", message: "Service temporarily unavailable." } }, { status: 502 });
  }
}

export { forward as GET, forward as HEAD, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
