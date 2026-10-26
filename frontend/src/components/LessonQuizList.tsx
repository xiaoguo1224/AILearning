"use client";

import { useEffect, useState } from "react";
import { Button } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { QuizGenerateDialog } from "@/components/QuizGenerateDialog";
import { QuizSection } from "@/components/QuizSection";
import {
  getJob,
  getLesson,
  listJobs,
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
  const [showDialog, setShowDialog] = useState(false);

  // Resume loading state if a quiz generation is already running (survives refresh).
  useEffect(() => {
    let cancelled = false;
    listJobs()
      .then(({ items }) => {
        if (cancelled) return;
        const running = items.find(
          (j) =>
            j.type === "quiz_generate" &&
            (j.status === "pending" || j.status === "running") &&
            j.ref_id === courseId,
        );
        if (running) {
          setGenerating(true);
          void (async () => {
            for (let i = 0; i < 60; i++) {
              if (cancelled) return;
              const job = await getJob(running.id);
              if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") break;
              await new Promise((r) => setTimeout(r, 2000));
            }
            if (!cancelled) {
              const fresh = await getLesson(lessonId);
              setQuiz(fresh.quiz);
              setGenerating(false);
            }
          })();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId]);

  /**
   * The same dialog the course bank uses, scoped to this lesson. `onGenerated`
   * refetches the lesson rather than trusting the job result: the job reports ids,
   * and the questions themselves (options, concept, attempt state) come from the
   * lesson payload.
   */
  const dialog = (
    <QuizGenerateDialog
      courseId={courseId}
      scopes={[
        {
          value: `lesson:${lessonId}`,
          label: t("This lesson"),
          lessonIds: [lessonId],
        },
      ]}
      onClose={() => setShowDialog(false)}
      onGenerated={() => {
        void getLesson(lessonId)
          .then((fresh) => setQuiz(fresh.quiz))
          .catch(() => {});
      }}
    />
  );

  if (quiz.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <p className="text-small text-ink-muted">{t("No questions for this lesson yet.")}</p>
        <Button type="primary" onClick={() => setShowDialog(true)} style={{ marginTop: 16 }}>
          AI 出题
        </Button>
        {showDialog && dialog}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, textAlign: "right" }}>
        <Button
          onClick={() => setShowDialog(true)}
          loading={generating}
          disabled={generating}
        >
          AI 出题
        </Button>
      </div>
      {showDialog && dialog}
    <QuizSection
      quiz={quiz}
      progress={progress}
      courseId={courseId}
      returnHref={`/courses/${courseId}/lessons/${lessonId}/quiz`}
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
    </div>
  );
}
