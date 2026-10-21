"use client";

import { useState } from "react";

import { QuizSection } from "@/components/QuizSection";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, createQuizVariant, getCourseQuiz, getJob, getQuizItem, startQuizGenerateJob, type QuizBankItem, type QuizBankLesson, type QuizKindCount } from "@/lib/api";
import type { QuizItem, QuizProgress } from "@/lib/types";

const KINDS = ["mcq", "short", "truefalse", "code"] as const;

const KIND_LABELS: Record<string, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  truefalse: "True/false",
  code: "Code",
};

function VariantButton({
  courseId,
  itemId,
  onCreated,
}: {
  courseId: number;
  itemId: number;
  onCreated: (created: import("@/lib/api").QuizVariant) => void;
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
          const created = await createQuizVariant(courseId, itemId);
          onCreated(created);
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

function toQuizItem(item: QuizBankItem): QuizItem {
  return {
    id: item.id,
    question: item.question,
    kind: item.kind as QuizItem["kind"],
    options: item.options,
    concept: item.concept,
    attempt_state: item.attempt_state,
  };
}

/**
 * This lesson's questions, in the lesson page sidebar.
 *
 * Previously the quiz sat at the bottom of the lesson spanning the full width;
 * it now lives beside the content, scoped to this lesson only, with AI
 * generation fixed to this lesson (no scope picker — there is nothing else it
 * could mean here).
 */
export function LessonQuizPanel({
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({
    mcq: 2,
    short: 0,
    truefalse: 0,
    code: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
      // Poll until the job finishes, then append the created questions.
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await getJob(job_id);
        if (job.status === "completed") {
          const created = (job.result?.created as number[] | undefined) ?? [];
          // Fetch the new items to get their full shape.
          const freshItems = await Promise.all(created.map((id) => getQuizItem(id)));
          setQuiz((prev) => [...prev, ...freshItems.map(toQuizItem)]);
          setDialogOpen(false);
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error || t("Generation failed."));
          break;
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("Questions")}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <span aria-hidden className="text-ink-muted">{open ? "▾" : "▸"}</span>
          <span className="text-micro font-semibold uppercase tracking-wide text-ink-muted">
            {t("Questions")}
            {quiz.length > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal">
                {t("{0} in this lesson", quiz.length)}
              </span>
            )}
          </span>
        </button>
        <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
          {t("AI generate")}
        </Button>
      </div>

      {open &&
        (quiz.length === 0 ? (
          <p className="mt-3 text-small text-ink-muted">
            {t("No questions for this lesson yet. Generate some with AI.")}
          </p>
        ) : (
          <div className="mt-3 rounded-surface border border-line bg-surface p-4">
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
        ))}

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Generate questions")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setDialogOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-surface bg-surface p-6 shadow-raise"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-subtitle font-semibold">{t("Generate questions")}</h3>
            <p className="mt-1 text-small text-ink-muted">
              {t("For this lesson only.")}
            </p>
            {error && (
              <p role="alert" className="mt-3 text-small text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 space-y-3">
              {KINDS.map((kind) => (
                <label key={kind} className="flex items-center justify-between gap-3">
                  <span className="text-small">{t(KIND_LABELS[kind])}</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={counts[kind]}
                    disabled={busy}
                    onChange={(e) =>
                      setCounts((prev) => ({
                        ...prev,
                        [kind]: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-20 rounded-control border border-line bg-surface px-2 py-1 text-small"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialogOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button size="sm" disabled={busy || total === 0} onClick={() => void submit()}>
                {busy ? t("Generating…") : t("Generate {0}", total)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
