"use client";

import { useState } from "react";
import { Button } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { LessonQaSection } from "@/components/LessonQaSection";
import { LessonToc } from "@/components/LessonToc";
import type { QuizItem, QuizProgress } from "@/lib/types";
import Link from "next/link";

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
  const [qaOpen, setQaOpen] = useState(true);

  return (
    <div className="flex items-start gap-6">
      {/* Left: table of contents */}
      <aside
        aria-label={t("Contents")}
        className="w-64 shrink-0"
        style={{ position: "sticky", top: "1.5rem", maxHeight: "calc(100vh - 3rem)", overflowY: "auto" }}
      >
        <LessonToc content={content} />
        <Link
          href={`/courses/${courseId}/lessons/${lessonId}/quiz`}
          className="mt-4 block rounded-surface border border-line bg-surface p-4 text-small font-medium hover:border-line-strong"
        >
          {t("Questions")} ({quiz.length})
          <span aria-hidden className="ml-1">→</span>
        </Link>
      </aside>

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
            <Button
              onClick={() => setQaOpen(false)}
              aria-label={t("Hide Q&A")}
              type="text"
              size="small"
            >
              {t("Hide")}
            </Button>
          </div>
          <LessonQaSection lessonId={lessonId} lessonTitle={lessonTitle} />
        </aside>
      ) : (
        <Button
          onClick={() => setQaOpen(true)}
          aria-label={t("Show Q&A")}
          size="small"
          style={{ position: "sticky", top: "1.5rem", flexShrink: 0 }}
        >
          {t("Q&A")}
        </Button>
      )}
    </div>
  );
}
