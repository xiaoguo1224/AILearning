"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Modal } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { QuizSection } from "@/components/QuizSection";
import {
  ApiError,
  getJob,
  getLesson,
  listJobs,
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

  const KIND_META: Record<string, { icon: string; desc: string }> = {
    mcq: { icon: "☰", desc: t("Multiple choice with options") },
    short: { icon: "✎", desc: t("Short answer or fill in the blank") },
    truefalse: { icon: "✓", desc: t("True or false judgment") },
    code: { icon: "⟨/⟩", desc: t("Programming exercise") },
  };

  function adjust(kind: string, delta: number) {
    setCounts((c) => ({
      ...c,
      [kind]: Math.max(0, Math.min(20, (c[kind] || 0) + delta)),
    }));
  }

  return (
    <Modal
      open={true}
      onCancel={onClose}
      title={null}
      footer={null}
      width={520}
    >
      <div style={{ padding: "8px 4px" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>
          {t("AI 出题")}
        </h3>
        <p style={{ color: "var(--ink-muted)", fontSize: 13, margin: "0 0 20px" }}>
          {t("Pick the types and how many of each.")}
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const active = (counts[kind] || 0) > 0;
            return (
              <div
                key={kind}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                  background: active ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    background: active ? "var(--accent)" : "var(--surface)",
                    color: active ? "#fff" : "var(--ink-muted)",
                    transition: "all 0.2s",
                  }}
                >
                  {meta.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {t(`quiz_kind_${kind}`)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                    {meta.desc}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Button
                    size="small"
                    shape="circle"
                    disabled={busy || (counts[kind] || 0) <= 0}
                    onClick={() => adjust(kind, -1)}
                  >
                    −
                  </Button>
                  <span
                    style={{
                      minWidth: 28,
                      textAlign: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      color: active ? "var(--accent)" : "var(--ink-muted)",
                    }}
                  >
                    {counts[kind] || 0}
                  </span>
                  <Button
                    size="small"
                    shape="circle"
                    disabled={busy || (counts[kind] || 0) >= 20}
                    onClick={() => adjust(kind, 1)}
                  >
                    ＋
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {error && (
          <Alert title={error} type="error" showIcon style={{ marginTop: 16 }} />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>
            {total > 0
              ? t("Total: {0} questions", total)
              : t("Select at least one question")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onClose} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={total === 0 || busy}
              onClick={submit}
              style={{ minWidth: 120 }}
            >
              {busy ? t("Generating…") : t("Generate")}
            </Button>
          </div>
        </div>
      </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId]);

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
        <Button
          onClick={() => setShowDialog(true)}
          loading={generating}
          disabled={generating}
        >
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
