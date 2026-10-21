import { NextResponse } from "next/server";

/**
 * Sidebar project list, served same-origin so the client sidebar never depends
 * on the backend's CORS allowlist (which only whitelists the default dev port).
 * Returns [] when the backend is unreachable; the sidebar then hides the section.
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/api/projects?status=active&offset=0&limit=8`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    return NextResponse.json(
      items.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
