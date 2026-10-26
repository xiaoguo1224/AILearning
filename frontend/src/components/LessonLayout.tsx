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
 * Wide screens use a sticky contents / article / Q&A grid. Q&A moves below the
 * article at medium widths; narrow screens stack all three in reading order.
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
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_auto]">
      {/* Left: table of contents */}
      <aside
        aria-label={t("Contents")}
        className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
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
          className="min-w-0 w-full space-y-6 xl:col-start-2 2xl:col-start-auto 2xl:w-80 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto"
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
          className="justify-self-start xl:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-6"
        >
          {t("Q&A")}
        </Button>
      )}
    </div>
  );
}
