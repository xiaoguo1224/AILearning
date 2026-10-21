"use client";

import { useState } from "react";
import { Alert, Button, Form, InputNumber, Modal } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { QuizSection } from "@/components/QuizSection";
import {
  ApiError,
  getJob,
  getLesson,
  startQuizGenerateJob,
  startQuizVariantJob,
  type QuizKindCount,
  type QuizVariant,
} from "@/lib/api";
import type { QuizItem, QuizProgress } from "@/lib/types";

const KINDS = ["mcq", "short", "truefalse", "code"] as const;

function LessonQuizGenerateDialog({
  courseId,
  lessonId,
  onClose,
  onGenerated,
}: {
  courseId: number;
  lessonId: number;
  onClose: () => void;
  onGenerated: (quiz: QuizItem[]) => void;
}) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, number>>({
    mcq: 5,
    short: 0,
    truefalse: 0,
    code: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = KINDS.reduce((sum, k) => sum + (counts[k] || 0), 0);

  async function submit() {
    const items: QuizKindCount[] = KINDS.filter((k) => counts[k] > 0).map((k) => ({
      kind: k,
      count: counts[k],
    }));
    if (items.length === 0) {
      setError(t("Ask for at least one question."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await startQuizGenerateJob(courseId, items, lessonId);
      for (let i = 0; i < 60; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") break;
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error || t("Could not generate questions."));
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      const fresh = await getLesson(lessonId);
      onGenerated(fresh.quiz);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not generate questions."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={true}
      onCancel={onClose}
      title={t("Generate questions")}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t("Cancel")}
        </Button>,
        <Button
          key="generate"
          type="primary"
          loading={busy}
          disabled={total === 0}
          onClick={submit}
        >
          {busy ? t("Generating…") : t("Generate {0} questions", total)}
        </Button>,
      ]}
    >
      <p>{t("Pick the types and how many of each.")}</p>
      <Form layout="vertical" style={{ marginTop: 16 }}>
        {KINDS.map((kind) => (
          <Form.Item key={kind} label={t(`quiz_kind_${kind}`)}>
            <InputNumber
              min={0}
              max={20}
              value={counts[kind]}
              onChange={(v) =>
                setCounts((c) => ({
                  ...c,
                  [kind]: Math.max(0, Math.min(20, Number(v) || 0)),
                }))
              }
            />
          </Form.Item>
        ))}
        {error && <Alert title={error} type="error" showIcon />}
      </Form>
    </Modal>
  );
}

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

  if (quiz.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <p className="text-small text-ink-muted">{t("No questions for this lesson yet.")}</p>
        <Button type="primary" onClick={() => setShowDialog(true)} style={{ marginTop: 16 }}>
          AI 出题
        </Button>
        {showDialog && (
          <LessonQuizGenerateDialog
            courseId={courseId}
            lessonId={lessonId}
            onClose={() => setShowDialog(false)}
            onGenerated={(q) => setQuiz(q)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, textAlign: "right" }}>
        <Button onClick={() => setShowDialog(true)}>
          AI 出题
        </Button>
      </div>
      {showDialog && (
        <LessonQuizGenerateDialog
          courseId={courseId}
          lessonId={lessonId}
          onClose={() => setShowDialog(false)}
          onGenerated={(q) => setQuiz(q)}
        />
      )}
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
    </div>
  );
}
