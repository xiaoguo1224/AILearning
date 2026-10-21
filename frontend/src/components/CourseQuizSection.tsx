"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button as AntButton, Form, InputNumber, Modal, Select } from "antd";
import { QuizSection } from "@/components/QuizSection";
import { useI18n } from "@/components/LocaleProvider";
import {
  ApiError,
  getJob,
  startQuizVariantJob,
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
    <Modal
      open={true}
      onCancel={onClose}
      title={t("Generate questions")}
      footer={[
        <AntButton key="cancel" onClick={onClose}>
          {t("Cancel")}
        </AntButton>,
        <AntButton
          key="generate"
          type="primary"
          loading={busy}
          disabled={total === 0}
          onClick={submit}
        >
          {busy ? t("Generating…") : t("Generate {0} questions", total)}
        </AntButton>,
      ]}
    >
      <p>{t("Pick the types and how many of each. The AI writes them from this course's lessons.")}</p>
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label={t("Scope")}>
          <Select
            value={lessonId}
            onChange={(v) => setLessonId(v)}
            options={[
              { value: "all", label: t("Whole course") },
              ...bank.modules.flatMap((m) =>
                m.lessons.map((l) => ({ value: String(l.id), label: l.title }))
              ),
            ]}
          />
        </Form.Item>
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
        {error && <Alert type="error" message={error} showIcon />}
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
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <AntButton
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { job_id } = await startQuizVariantJob(courseId, itemId);
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const job = await getJob(job_id);
            if (job.status === "completed") {
              onCreated();
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
    </AntButton>
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
    <section aria-label={t("Questions")} className="rounded-surface bg-surface p-6 shadow-raise sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AntButton
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
        </AntButton>
        <AntButton
              onClick={() => setDialogOpen(true)}
          className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white"
        >
          {t("Generate questions")}
        </AntButton>
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
                    <QuizSection
                      quiz={lesson.items.map(toQuizItem)}
                      progress={progress}
                      courseId={courseId}
                      renderItemAction={(item) => (
                        <VariantButton
                          courseId={bank.course_id}
                          itemId={item.id}
                          onCreated={() => void load()}
                        />
                      )}
                    />
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
