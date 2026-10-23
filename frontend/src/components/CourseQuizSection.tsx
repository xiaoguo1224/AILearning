"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/components/LocaleProvider";
import { ApiError, getCourseQuiz, type QuizBank } from "@/lib/api";

/**
 * The course page's question card: a way IN, not the bank itself.
 *
 * The bank used to expand inline under the lesson list, which put every question
 * below the fold of a page whose subject is the course outline, and left the
 * learner scrolling to find out what they had been asked. The card now answers
 * the two questions this page can answer cheaply — how many, how many answered —
 * and links to /courses/{id}/quiz for the questions themselves, which is also
 * where "AI 出题" lives. One place to generate, one place to read the result.
 */
export function CourseQuizSection({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const [bank, setBank] = useState<QuizBank | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plain function with .then(), not async/await: the compiler traces setState
  // through an awaited call made synchronously in an effect and flags it, the
  // same shape CourseQuizBank's loader uses.
  const load = useCallback(() => {
    getCourseQuiz(courseId)
      .then((b) => {
        setBank(b);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("Could not load questions."));
      });
  }, [courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const answered = bank
    ? bank.modules
        .flatMap((m) => m.lessons.flatMap((l) => l.items))
        .filter((item) => (item.attempt_state?.attempts ?? 0) > 0).length
    : 0;

  return (
    <section aria-label={t("Questions")} className="rounded-surface bg-surface p-5 shadow-raise">
      <Link
        href={`/courses/${courseId}/quiz`}
        className="group block min-w-0 rounded-control focus-visible:outline focus-visible:outline-2"
      >
        <span className="flex items-center gap-2 text-subtitle font-semibold group-hover:text-accent">
          <span aria-hidden>▸</span>
          {t("Questions")}
        </span>
        <span className="mt-1 block break-words text-small font-normal text-ink-muted">
          {bank
            ? `${t("{0} questions in this course", bank.total)}${
                answered > 0 ? ` · ${t("{0} answered", answered)}` : ""
              }`
            : t("Loading…")}
        </span>
      </Link>

      {error && (
        <p role="alert" className="mt-3 text-small text-danger">
          {error}
        </p>
      )}
    </section>
  );
}