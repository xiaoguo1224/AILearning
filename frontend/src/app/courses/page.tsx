import { getTranslator } from "@/lib/locale-server";
import Link from "next/link";

import { CourseDeletionProvider, DeleteCourseButton } from "@/components/DeleteCourseButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
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

/**
 * Shared with both "new course" entry points below rather than routed through Button:
 * Button only wraps a native <button>, and both of these have to be real links so the
 * empty-list focus restore (see DeleteCourseButton) can find them by id and Next can
 * prefetch the route. The string is Button's own BASE + primary + md, kept in sync by
 * hand until a link-flavoured variant of that primitive exists.
 */
const PRIMARY_LINK_CLASSES =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-fill " +
  "px-4 py-2 text-ui font-medium text-on-fill transition-colors duration-fast ease-standard " +
  "hover:bg-fill-hover";

/**
 * Deterministic cover gradients, one per course, standing in for MOOC course
 * cover art. Courses carry no image of their own, so the id picks a gradient;
 * the white title on top is what makes each card recognizable at a glance.
 */
const COVERS = [
  "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
  "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
  "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
  "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)",
  "linear-gradient(135deg, #fb7185 0%, #e11d48 100%)",
  "linear-gradient(135deg, #94a3b8 0%, #475569 100%)",
];

function coverFor(course: CourseSummary): string {
  return COVERS[Math.abs(course.id) % COVERS.length];
}

/**
 * THE CARD IS NO LONGER ONE BIG LINK, and it had to stop being one. Delete is a button,
 * and a button nested inside an anchor is invalid HTML that browsers recover from
 * inconsistently: the press would sometimes navigate to the course it was deleting. The
 * link now wraps only the cover and the title block, and the button is its sibling, so
 * each control has exactly one meaning.
 *
 * The ids on the two "new course" controls are what the deletion provider focuses after a
 * row disappears. They are mutually exclusive, and which one exists is precisely what
 * changes when the last course goes, which is why focus is resolved by lookup at the
 * moment it is needed rather than captured beforehand.
 */
export default async function CoursesPage() {
  const t = await getTranslator();
  let courses: CourseSummary[] = [];
  let loadError: string | null = null;
  try {
    courses = await listCourses(t.locale);
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  return (
    <CourseDeletionProvider>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-display">{t("My courses")}</h1>
            <p className="mt-1.5 text-ui text-ink-muted">
              {t("Turn any material into a structured course with quizzes.")}
            </p>
          </div>
          {courses.length > 0 && (
            <Link id="new-course" href="/courses/new" className={PRIMARY_LINK_CLASSES}>
              {t("New course")}
            </Link>
          )}
        </div>

        {loadError ? (
          <div className="mt-8"><ErrorState message={loadError} /></div>
        ) : courses.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title={t("No courses yet")}
              description={t("Paste text, drop in a URL, or upload a PDF to get started.")}
              action={
                <Link id="create-first-course" href="/courses/new" className={PRIMARY_LINK_CLASSES}>
                  {t("Create your first course")}
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-8 grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <li key={course.id} className="min-w-0">
                <article className="overflow-hidden rounded-surface bg-surface shadow-raise transition-transform duration-slow ease-standard hover:-translate-y-1">
                  <Link href={`/courses/${course.id}`} className="block">
                    <div
                      className="relative aspect-[16/9]"
                      style={{ background: coverFor(course) }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center p-6">
                        <span className="line-clamp-2 text-center text-title font-bold text-white">
                          {course.title}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h2 className="truncate text-ui font-semibold text-ink">
                        {course.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 min-h-10 text-small text-ink-muted">
                        {course.description}
                      </p>
                    </div>
                  </Link>
                  <div className="px-4 pb-2">
                    <DeleteCourseButton courseId={course.id} title={course.title} />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
    </CourseDeletionProvider>
  );
}
