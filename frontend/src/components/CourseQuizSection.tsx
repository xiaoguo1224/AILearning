"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { QuizSection } from "@/components/QuizSection";
import { useI18n } from "@/components/LocaleProvider";
import {
  ApiError,
  generateQuizQuestions,
  getCourseQuiz,
  type QuizBank,
  type QuizBankItem,
  type QuizKindCount,
} from "@/lib/api";
import type { QuizItem, QuizProgress } from "@/lib/types";

const KINDS = ["mcq", "short", "truefalse", "code"] as const;

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

function QuizGenerateDialog({
  bank,
  onClose,
  onGenerated,
}: {
  bank: QuizBank;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { t } = useI18n();
  const [lessonId, setLessonId] = useState<string>("all");
  const [counts, setCounts] = useState<Record<string, number>>({
    mcq: 2,
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
      await generateQuizQuestions(
        bank.course_id,
        items,
        lessonId === "all" ? undefined : Number(lessonId),
      );
      onGenerated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not generate questions."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Generate questions")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-surface border border-line bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-subtitle font-semibold">{t("Generate questions")}</h2>
        <p className="mt-1 text-small text-ink-muted">
          {t("Pick the types and how many of each. The AI writes them from this course's lessons.")}
        </p>

        <label className="mt-4 block text-small font-medium">
          {t("Scope")}
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui"
          >
            <option value="all">{t("Whole course")}</option>
            {bank.modules.flatMap((m) =>
              m.lessons.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.title}
                </option>
              )),
            )}
          </select>
        </label>

        <div className="mt-4 flex flex-col gap-2">
          {KINDS.map((kind) => (
            <label key={kind} className="flex items-center justify-between gap-3 text-ui">
              <span>{t(`quiz_kind_${kind}`)}</span>
              <input
                type="number"
                min={0}
                max={20}
                value={counts[kind]}
                onChange={(e) =>
                  setCounts((c) => ({
                    ...c,
                    [kind]: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                  }))
                }
                className="w-20 rounded-control border border-line-strong bg-surface px-2 py-1 text-ui"
              />
            </label>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-small text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-line px-4 py-2 text-ui"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || total === 0}
            className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white disabled:opacity-50"
          >
            {busy ? t("Generating…") : t("Generate {0} questions", total)}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The course's question bank, laid out as a section of the course page.
 * Collapsed to a header row until opened: a full bank is long, and the header
 * (count + answered tally) is what the learner checks most. The AI出题 button
 * lives in the header so it is reachable without expanding.
 */
export function CourseQuizSection({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const [bank, setBank] = useState<QuizBank | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plain function with .then(), not async/await: the compiler traces setState
  // through an awaited call made synchronously in an effect and flags it, the
  // same shape ConceptTutor's loader uses.
  const load = useCallback(() => {
    getCourseQuiz(courseId)
      .then((b) => setBank(b))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("Could not load questions."));
      });
  }, [courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const progress: QuizProgress | null = useMemo(() => {
    if (!bank) return null;
    const items = bank.modules.flatMap((m) => m.lessons.flatMap((l) => l.items));
    return {
      items: items.length,
      answered: items.filter((i) => (i.attempt_state?.attempts ?? 0) > 0).length,
      correct: items.filter((i) => i.attempt_state?.ever_correct).length,
      first_try_correct: items.filter((i) => i.attempt_state?.first_attempt_correct).length,
    };
  }, [bank]);

  return (
    <section aria-label={t("Questions")} className="mt-6 rounded-surface bg-surface p-6 shadow-raise sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-subtitle font-semibold hover:text-accent"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          {t("Questions")}
          {bank && (
            <span className="text-small font-normal text-ink-muted">
              {t("{0} questions in this course", bank.total)}
              {progress && progress.answered > 0 && ` · ${t("{0} answered", progress.answered)}`}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white"
        >
          {t("Generate questions")}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-small text-danger">
          {error}
        </p>
      )}

      {open && bank && progress && (
        <div className="mt-4">
          {bank.modules.map((module) => (
            <div key={module.id} className="mt-6 first:mt-2">
              <h3 className="text-ui font-semibold">{module.title}</h3>
              {module.lessons.map((lesson) =>
                lesson.items.length > 0 ? (
                  <div key={lesson.id} className="mt-4">
                    <h4 className="text-small font-medium text-ink-muted">{lesson.title}</h4>
                    <QuizSection quiz={lesson.items.map(toQuizItem)} progress={progress} />
                  </div>
                ) : null,
              )}
            </div>
          ))}
        </div>
      )}

      {dialogOpen && bank && (
        <QuizGenerateDialog
          bank={bank}
          onClose={() => setDialogOpen(false)}
          onGenerated={() => {
            setOpen(true);
            void load();
          }}
        />
      )}
    </section>
  );
}
