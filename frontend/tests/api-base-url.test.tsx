import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([
  { server: true, expected: "http://backend:8000/courses" },
  { server: false, expected: "http://localhost:8000/courses" },
])("uses the correct API address when server=$server", async ({ server, expected }) => {
  vi.stubEnv("API_INTERNAL_URL", "http://backend:8000");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000");
  if (server) vi.stubGlobal("window", undefined);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();
  const { listCourses } = await import("@/lib/api");
  await expect(listCourses()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledWith(expected, { cache: "no-store" });
});
