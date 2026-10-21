"use client";

import { useEffect, useState } from "react";
import { Button, Spin } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { QuizSection } from "@/components/QuizSection";
import {
  getJob,
  getLesson,
  startQuizGenerateJob,
  startQuizVariantJob,
  type QuizVariant,
} from "@/lib/api";
import type { QuizItem, QuizProgress } from "@/lib/types";

function VariantButton({
  courseId,
  itemId,
  onCreated,
}: {
  courseId: number;
  itemId: number;
  onCreated: (created: QuizVariant) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      size="small"
      onClick={async () => {
        setBusy(true);
        try {
          const { job_id } = await startQuizVariantJob(courseId, itemId);
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const job = await getJob(job_id);
            if (job.status === "completed" && job.result) {
              onCreated(job.result as unknown as QuizVariant);
              break;
            }
            if (job.status === "failed" || job.status === "cancelled") break;
          }
        } finally {
          setBusy(false);
        }
      }}
      title={t("Create a variant of this question")}
    >
      {busy ? t("Creating…") : t("Variant")}
    </Button>
  );
}

/**
 * Full-width question list for the lesson's dedicated questions page.
 * Each question gets a variant button; variants are generated against the
 * learner's answer history for that question.
 */
export function LessonQuizList({
  courseId,
  lessonId,
  initialQuiz,
  progress,
}: {
  courseId: number;
  lessonId: number;
  initialQuiz: QuizItem[];
  progress: QuizProgress;
}) {
  const { t } = useI18n();
  const [quiz, setQuiz] = useState<QuizItem[]>(initialQuiz);
  const [generating, setGenerating] = useState(false);

  // Auto-generate questions when the lesson has none (e.g. imported courses).
  useEffect(() => {
    if (initialQuiz.length > 0) return;
    let cancelled = false;
    async function autoGenerate() {
      setGenerating(true);
      try {
        const { job_id } = await startQuizGenerateJob(
          courseId,
          [{ kind: "single_choice", count: 5 }],
          lessonId,
        );
        for (let i = 0; i < 60; i++) {
          if (cancelled) return;
          const job = await getJob(job_id);
          if (job.status === "completed") break;
          if (job.status === "failed" || job.status === "cancelled") break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!cancelled) {
          const fresh = await getLesson(lessonId);
          setQuiz(fresh.quiz);
        }
      } catch {
        // Leave the empty state; user can retry manually.
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }
    void autoGenerate();
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId, initialQuiz.length]);

  async function manualGenerate() {
    setGenerating(true);
    try {
      const { job_id } = await startQuizGenerateJob(
        courseId,
        [{ kind: "single_choice", count: 5 }],
        lessonId,
      );
      for (let i = 0; i < 60; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") break;
        if (job.status === "failed" || job.status === "cancelled") break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const fresh = await getLesson(lessonId);
      setQuiz(fresh.quiz);
    } finally {
      setGenerating(false);
    }
  }

  if (quiz.length === 0) {
    if (generating) {
      return (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
          <p className="mt-3 text-small text-ink-muted">AI 正在生成题目…</p>
        </div>
      );
    }
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <p className="text-small text-ink-muted">{t("No questions for this lesson yet.")}</p>
        <Button type="primary" onClick={() => void manualGenerate()} style={{ marginTop: 16 }}>
          AI 出题
        </Button>
      </div>
    );
  }

  return (
    <QuizSection
      quiz={quiz}
      progress={progress}
      courseId={courseId}
      renderItemAction={(item) => (
        <VariantButton
          courseId={courseId}
          itemId={item.id}
          onCreated={(created) =>
            setQuiz((prev) => [
              ...prev,
              {
                id: created.id,
                question: created.question,
                kind: created.kind as QuizItem["kind"],
                options: created.options,
                concept: created.concept,
                attempt_state: {
                  attempts: 0,
                  first_attempt_correct: null,
                  ever_correct: false,
                  latest_quiz_attempt: null,
                },
              },
            ])
          }
        />
      )}
    />
  );
}
