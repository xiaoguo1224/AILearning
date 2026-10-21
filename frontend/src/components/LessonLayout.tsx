"use client";

import { useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { LessonQaSection } from "@/components/LessonQaSection";
import { LessonQuizPanel } from "@/components/LessonQuizPanel";
import { LessonToc } from "@/components/LessonToc";
import type { QuizItem, QuizProgress } from "@/lib/types";

/**
 * Lesson page layout: questions on the left, article in the center, Q&A on
 * the right — each side column an independent sticky module that does not
 * scroll with the article.
 *
 * The sidebars are in-flow (not overlays), so the blank space on wide screens
 * is actually used. Each sidebar collapses to a slim edge toggle, giving the
 * article the full width when the learner wants focused reading.
 */
export function LessonLayout({
  courseId,
  lessonId,
  lessonTitle,
  content,
  quiz,
  quizProgress,
  disclaimer,
}: {
  courseId: number;
  lessonId: number;
  lessonTitle: string;
  content: string;
  quiz: QuizItem[];
  quizProgress: QuizProgress;
  disclaimer: string;
}) {
  const { t } = useI18n();
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [qaOpen, setQaOpen] = useState(true);

  return (
    <div className="flex items-start gap-6">
      {/* Left: questions */}
      {questionsOpen ? (
        <aside
          aria-label={t("Questions")}
          className="w-72 shrink-0 space-y-6 self-sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto"
          style={{ position: "sticky", top: "1.5rem" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-micro font-semibold uppercase tracking-wide text-ink-muted">
              {t("Questions")}
            </h2>
            <button
              type="button"
              onClick={() => setQuestionsOpen(false)}
              aria-label={t("Hide questions")}
              className="rounded-control px-2 py-0.5 text-micro text-ink-muted hover:text-ink"
            >
              {t("Hide")}
            </button>
          </div>
          <LessonToc content={content} />
          <LessonQuizPanel
            courseId={courseId}
            lessonId={lessonId}
            initialQuiz={quiz}
            progress={quizProgress}
          />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setQuestionsOpen(true)}
          aria-label={t("Show questions")}
          className="shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-micro text-ink-muted hover:text-ink"
          style={{ position: "sticky", top: "1.5rem" }}
        >
          {t("Questions")}
        </button>
      )}

      {/* Center: article */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl">
          <p className="mb-4 rounded-surface border border-line p-4 text-small text-ink-muted">
            {disclaimer}
          </p>
          <LessonMarkdown content={content} title={lessonTitle} />
        </div>
      </div>

      {/* Right: Q&A */}
      {qaOpen ? (
        <aside
          aria-label={t("Q&A")}
          className="w-80 shrink-0 space-y-6"
          style={{ position: "sticky", top: "1.5rem", maxHeight: "calc(100vh - 3rem)", overflowY: "auto" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-micro font-semibold uppercase tracking-wide text-ink-muted">
              {t("Q&A")}
            </h2>
            <button
              type="button"
              onClick={() => setQaOpen(false)}
              aria-label={t("Hide Q&A")}
              className="rounded-control px-2 py-0.5 text-micro text-ink-muted hover:text-ink"
            >
              {t("Hide")}
            </button>
          </div>
          <LessonQaSection lessonId={lessonId} lessonTitle={lessonTitle} />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setQaOpen(true)}
          aria-label={t("Show Q&A")}
          className="shrink-0 rounded-control border border-line bg-surface px-2 py-1 text-micro text-ink-muted hover:text-ink"
          style={{ position: "sticky", top: "1.5rem" }}
        >
          {t("Q&A")}
        </button>
      )}
    </div>
  );
}
