import { notFound } from "next/navigation";

import { CourseQuizBank } from "@/components/CourseQuizBank";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getCourse } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

/**
 * Every question this course has, on their own page.
 *
 * The course page's question card links here rather than expanding inline: the
 * bank is long, it is scoped to the whole course rather than to one lesson, and
 * answering is something a learner opens rather than something they find.
 */
export default async function CourseQuizPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const t = await getTranslator();
  const { courseId } = await params;
  const course = Number(courseId);
  if (!Number.isInteger(course) || course <= 0) notFound();

  let title: string;
  try {
    const detail = await getCourse(course, t.locale);
    title = detail.title;
  } catch (err) {
    // Same split as the course page itself: a course that does not exist is a
    // 404, and a backend that is merely unreachable is a sentence on a page.
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        <PageHeader title={t("Questions")} />
        <ErrorState
          className="mt-8"
          message={
            err instanceof ApiError
              ? err.message
              : t("Could not reach the server. Is the backend running?")
          }
        />
      </main>
    );
  }

  return <CourseQuizBank courseId={course} courseTitle={title} />;
}