import { getTranslator } from "@/lib/locale-server";

import { CourseDeletionProvider } from "@/components/DeleteCourseButton";
import type { CourseSort } from "@/components/CourseBrowser";
import { CourseListView } from "@/components/CourseListView";
import { ApiError, listCourses } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * 200-with-inline-error, not a thrown 500, and this decision is now shared by every
 * page under src/app that fetches. There are EIGHT of them, so count before editing this
 * sentence: this page, courses/[courseId], courses/[courseId]/lessons/[lessonId] and
 * courses/[courseId]/concepts (the four in this batch), plus /, /usage, /review and
 * courses/[courseId]/plan, which already worked this way. courses/new is the one page
 * that is not on the list, because it is a client form and fetches nothing on render.
 * A bare re-thrown fetch failure used to reach Next's own error boundary, which renders
 * a generic "A server error occurred" screen with an opaque digest and genuinely returns
 * 500: correct for a bug in OUR code, wrong for "the backend is not running", which is
 * an expected, recoverable condition for a self-hoster and not a defect in this page.
 *
 * The alternative, catch the error and still respond 500 with our own body, was
 * considered and rejected: it would mean those eight pages behave differently under
 * "backend down" depending on which one you loaded first,
 * which is a worse failure mode for a self-hoster to debug than the status code being
 * arguably wrong. A monitoring probe watching a single route will treat a self-hosted
 * study tool as up as long as the Next process answers, backend or no; that is an
 * existing property of / and /usage this change does not newly introduce, and fixing it
 * properly means a dedicated health-check endpoint, not a per-page status code, which is
 * out of scope here.
 */

export default async function CoursesPage({ searchParams }: {
  searchParams?: Promise<{ q?: string; sort?: string }>;
} = {}) {
  const t = await getTranslator();
  const params = await searchParams;
  const query = typeof params?.q === "string" ? params.q.slice(0, 200).trim() : "";
  const sort: CourseSort = params?.sort === "newest" || params?.sort === "initial" ? params.sort : "frequent";
  let courses: CourseSummary[] = [];
  let loadError: string | null = null;
  try {
    courses = await listCourses(t.locale);
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  return <CourseDeletionProvider>
    <CourseListView key={`${query}:${sort}`} courses={courses} error={loadError} query={query} sort={sort} />
  </CourseDeletionProvider>;
}
