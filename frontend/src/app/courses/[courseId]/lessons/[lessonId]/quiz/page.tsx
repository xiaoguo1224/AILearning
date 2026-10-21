import Link from "next/link";
import { notFound } from "next/navigation";

import { getTranslator } from "@/lib/locale-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { LessonQuizList } from "@/components/LessonQuizList";
import { getLesson } from "@/lib/api";

/**
 * Dedicated questions page for a lesson.
 *
 * Questions get the full page width here instead of being squeezed into a
 * sidebar — long stems, code blocks and options all display completely.
 */
export default async function LessonQuizPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId: courseIdStr, lessonId: lessonIdStr } = await params;
  const courseId = Number(courseIdStr);
  const lessonId = Number(lessonIdStr);
  const t = await getTranslator();

  let lesson;
  try {
    lesson = await getLesson(lessonId);
  } catch {
    notFound();
  }
  if (lesson.course_id !== courseId) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href={`/courses/${courseId}/lessons/${lessonId}`}
        className="text-small text-ink-muted hover:text-ink"
      >
        ← {t("Back to lesson")}
      </Link>
      <PageHeader
        className="mt-4"
        title={t("Questions: {0}", lesson.title)}
      />
      <div className="mt-8">
        <LessonQuizList
          courseId={courseId}
          lessonId={lessonId}
          initialQuiz={lesson.quiz}
          progress={lesson.quiz_progress}
        />
      </div>
    </main>
  );
}
