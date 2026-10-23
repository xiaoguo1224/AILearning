import { NextResponse } from "next/server";
import { listProjects } from "@/lib/api";

/**
 * Sidebar project list, served same-origin so the client sidebar never depends
 * on the backend's CORS allowlist (which only whitelists the default dev port).
 * Returns [] when the backend is unreachable; the sidebar then hides the section.
 */
export async function GET() {
  try {
    const data = await listProjects("active");
    const items = Array.isArray(data?.items) ? data.items.slice(0, 8) : [];
    return NextResponse.json(
      items.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })),
    );
  } catch {
    return NextResponse.json([]);
  }
}
