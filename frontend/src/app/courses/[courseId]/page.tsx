import { LocalizedText } from "@/components/LocaleProvider";


import { getTranslator } from "@/lib/locale-server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseTabs } from "@/components/CourseTabs";
import { CourseDeletionProvider } from "@/components/DeleteCourseButton";
import { EditCourseButton } from "@/components/EditCourseButton";
import { RegenerateCourseButton } from "@/components/RegenerateCourseButton";
import { CourseQaSection } from "@/components/CourseQaSection";
// 如果你之前报错，请确保这里的导入方式正确（比如改为 import CourseQuizSection from ...）
import { CourseQuizSection } from "@/components/CourseQuizSection";
import { CourseResourcesSection } from "@/components/CourseResourcesSection";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getCourse } from "@/lib/api";
import type { CourseDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

const BACK_TO_COURSES_LINK = (
  <Link
    href="/courses"
    className="text-small text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
  >
    <LocalizedText text="&larr; All courses" /></Link>
);

const START_LEARNING_CLASSES =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-fill " +
  "px-8 py-2.5 text-ui font-medium text-on-fill transition-colors duration-fast ease-standard " +
  "hover:bg-fill-hover";

export default async function CoursePage(props: { params: Promise<{ courseId: string }> }) {
  const t = await getTranslator();
  const { courseId } = await props.params;
  const id = Number(courseId);

  if (!Number.isInteger(id)) notFound();

  let course: CourseDetail;
  try {
    course = await getCourse(id, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    const message =
      err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {BACK_TO_COURSES_LINK}
        <PageHeader className="mt-4" title={t("Course")} />
        <ErrorState className="mt-8" message={message} />
      </main>
    );
  }

  const lessons = course.modules.flatMap((m) => m.lessons);
  const completedCount = lessons.filter((lesson) => lesson.completed).length;
  const percent = lessons.length === 0 ? 0 : Math.round((completedCount / lessons.length) * 100);
  const nextLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];

  return (
    <CourseDeletionProvider>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {/* Hero card */}
        <div className="rounded-surface bg-surface p-6 shadow-raise sm:p-8">
          <nav aria-label="Breadcrumb" className="text-small text-ink-subtle">
            <Link href="/courses" className="transition-colors duration-fast ease-standard hover:text-ink">
              {t("Courses")}
            </Link>
            <span aria-hidden className="mx-2">/</span>
            <span className="text-ink-muted">{course.title}</span>
          </nav>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="break-words text-[28px] font-bold leading-tight tracking-tight">
              {course.title}
            </h1>
            <EditCourseButton
              courseId={course.id}
              initialTitle={course.title}
              initialDescription={course.description ?? ""}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-muted">
            <span>{t("{0} lessons", lessons.length)}</span>
            <span>{t("{0} completed", completedCount)}</span>
            <span>{t("{0}% complete", percent)}</span>
          </div>
          {course.description && (
            <p className="mt-4 max-w-3xl text-ui text-ink-muted">{course.description}</p>
          )}
          {nextLesson && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/courses/${course.id}/lessons/${nextLesson.id}`}
                className={START_LEARNING_CLASSES}
              >
                {completedCount > 0 ? t("Continue learning") : t("Start learning")}
              </Link>
              <RegenerateCourseButton courseId={course.id} />
            </div>
          )}
        </div>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)_minmax(0,0.95fr)]">

          {/* Left rail: 增加 min-w-0, overflow-x-hidden 和 [&_*]:break-words */}
          <div className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:col-start-1 xl:row-start-1 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:overflow-x-hidden xl:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&_*]:break-words">
            <CourseQuizSection courseId={course.id} />
            <CourseResourcesSection courseId={course.id} />
          </div>

          {/* Chapters */}
          <div className="min-w-0 rounded-surface bg-surface p-6 shadow-raise sm:p-8 xl:col-start-2 xl:row-start-1">
            <CourseTabs courseId={course.id} active="lessons" />
            <div className="mt-6 flex flex-col gap-8">
              {course.modules.map((module, mi) => (
                <section key={module.id}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white text-small font-semibold">
                      {mi + 1}
                    </span>
                    <h2 className="text-subtitle font-semibold">{module.title}</h2>
                    <span className="text-micro text-ink-muted">
                      {module.lessons.length} 课时
                    </span>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1">
                    {module.lessons.map((lesson, li) => (
                      <li key={lesson.id}>
                        <Link
                          href={`/courses/${course.id}/lessons/${lesson.id}`}
                          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-fast ease-standard hover:bg-surface-sunken"
                        >
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-micro transition-colors ${
                              lesson.completed
                                ? "bg-success-fill text-success-on-fill"
                                : "border border-line-strong group-hover:border-accent group-hover:text-accent"
                            }`}
                          >
                            {lesson.completed ? "✓" : <span className="text-micro text-ink-subtle">{li + 1}</span>}
                          </span>
                          <span className={`flex-1 ${lesson.completed ? "text-ui text-ink-muted" : "text-ui"}`}>
                            {lesson.title}
                          </span>
                          {lesson.completed && <span className="sr-only">{t("(completed)")}</span>}
                          <span aria-hidden className="text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100">
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          {/* Right rail: 增加 min-w-0, overflow-x-hidden 和 [&_*]:break-words */}
          <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:overflow-x-hidden xl:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&_*]:break-words">
            <CourseQaSection courseId={course.id} courseTitle={course.title} />
            <div className="rounded-surface bg-surface p-6 shadow-raise">
              <h2 className="text-subtitle">{t("Learning progress")}</h2>
              <div className="mt-4">
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface-sunken"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("Learning progress")}
                >
                  <div className="h-full rounded-full bg-fill" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-2 text-small text-ink-muted">
                  {t("{0} of {1} lessons complete", completedCount, lessons.length)}
                </p>
              </div>
            </div>
            <div className="rounded-surface bg-surface p-6 shadow-raise">
              <h2 className="text-subtitle">{t("Course info")}</h2>
              <dl className="mt-4 space-y-3 text-small">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("Lessons")}</dt>
                  <dd className="font-medium">{lessons.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">{t("Completed")}</dt>
                  <dd className="font-medium">{completedCount}</dd>
                </div>
              </dl>
            </div>
          </aside>

        </div>
      </main>
    </CourseDeletionProvider>
  );
}