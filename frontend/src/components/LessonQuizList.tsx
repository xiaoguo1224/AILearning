"use client";

import { useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { QuizSection } from "@/components/QuizSection";
import { getJob, startQuizVariantJob, type QuizVariant } from "@/lib/api";
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
    <button
      type="button"
      disabled={busy}
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
      className="shrink-0 rounded-control border border-line px-2 py-1 text-small text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
    >
      {busy ? t("Creating…") : t("Variant")}
    </button>
  );
}

/**
 * Full-width question list for the lesson's dedicated questions page.
 * Each question gets a variant button; variants are generated against the
 * learner's answer history for that question.
 */
export function LessonQuizList({
  courseId,
  initialQuiz,
  progress,
}: {
  courseId: number;
  initialQuiz: QuizItem[];
  progress: QuizProgress;
}) {
  const { t } = useI18n();
  const [quiz, setQuiz] = useState<QuizItem[]>(initialQuiz);

  if (quiz.length === 0) {
    return (
      <p className="text-small text-ink-muted">{t("No questions for this lesson yet.")}</p>
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
