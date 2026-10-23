"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button as AntButton } from "antd";
import { QuizGenerateDialog, type QuizScopeOption } from "@/components/QuizGenerateDialog";
import { QuizSection } from "@/components/QuizSection";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ApiError,
  getCourseQuiz,
  getJob,
  startQuizVariantJob,
  type QuizBank,
  type QuizBankItem,
} from "@/lib/api";
import type { QuizItem, QuizProgress } from "@/lib/types";
import { QUIZ_KINDS, type QuizKind } from "@/lib/quizKinds";

export function toQuizItem(item: QuizBankItem): QuizItem {
  return {
    id: item.id,
    question: item.question,
    kind: item.kind as QuizItem["kind"],
    options: item.options,
    concept: item.concept,
    attempt_state: item.attempt_state,
  };
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
      onClick={() => {
        setBusy(true);
        void (async () => {
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
        })();
      }}
      title={t("Create a variant of this question")}
      className="shrink-0 rounded-control border border-line px-2 py-1 text-small text-ink-muted transition-colors hover:text-accent disabled:opacity-50"
    >
      {busy ? t("Creating…") : t("Variant")}
    </AntButton>
  );
}

/**
 * The whole course's questions, on their own page.
 *
 * The bank used to expand inline at the bottom of the course page, which pushed
 * every question below the fold of a page whose real subject is the lesson list,
 * and made "this course's questions" something you scroll to rather than go to.
 * Here the course page's question card is a link, and this is where it lands:
 * every module, every lesson, every question, grouped the way the course is.
 *
 * Two things this page has that the inline version could not: a table of contents
 * that stays put while the questions scroll, and chapters that collapse — a
 * sixteen-lesson chapter is not something to scroll through to reach chapter two.
 */
export function CourseQuizBank({
  courseId,
  courseTitle,
}: {
  courseId: number;
  courseTitle: string;
}) {
  const { t } = useI18n();
  const [bank, setBank] = useState<QuizBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [generateFor, setGenerateFor] = useState<string | null>(null);

  const load = useCallback(() => {
    getCourseQuiz(courseId)
      .then((b) => {
        setBank(b);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t("Could not load questions."));
      });
  }, [courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const allItems = useMemo(
    () => bank?.modules.flatMap((m) => m.lessons.flatMap((l) => l.items)) ?? [],
    [bank],
  );

  /**
   * The header counts the bank as the SERVER last saw it. Answering happens in
   * place below and does not refetch, so a tally that counted answers would go
   * stale the moment the learner used the page it is on. The per-kind breakdown
   * is a property of the questions themselves and cannot go stale.
   */
  const byKind = useMemo(() => {
    const counts = new Map<QuizKind, number>();
    for (const item of allItems) {
      const kind = item.kind as QuizKind;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return QUIZ_KINDS.filter((k) => counts.has(k)).map((k) => ({
      kind: k,
      count: counts.get(k) ?? 0,
    }));
  }, [allItems]);

  const progress: QuizProgress = useMemo(
    () => ({
      items: allItems.length,
      answered: allItems.filter((i) => (i.attempt_state?.attempts ?? 0) > 0).length,
      correct: allItems.filter((i) => i.attempt_state?.ever_correct).length,
      first_try_correct: allItems.filter((i) => i.attempt_state?.first_attempt_correct).length,
    }),
    [allItems],
  );

  /**
   * Every scope the dialog can generate for: the course, each chapter, each
   * lesson. Built once from the bank so the dialog and the page cannot disagree
   * about what "this chapter" contains.
   */
  const scopes: QuizScopeOption[] = useMemo(() => {
    if (!bank) return [];
    return [
      { value: "all", label: t("Whole course"), lessonIds: [] },
      ...bank.modules.map((module) => ({
        value: `module:${module.id}`,
        label: module.title,
        lessonIds: module.lessons.map((lesson) => lesson.id),
      })),
      ...bank.modules.flatMap((module) =>
        module.lessons.map((lesson) => ({
          value: `lesson:${lesson.id}`,
          label: `${module.title} · ${lesson.title}`,
          lessonIds: [lesson.id],
        })),
      ),
    ];
  }, [bank, t]);

  function toggle(moduleId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  const chapters = bank ? bank.modules.filter((m) => m.lessons.some((l) => l.items.length > 0)) : [];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <nav aria-label="Breadcrumb" className="text-small text-ink-subtle">
        <Link href="/courses" className="transition-colors duration-fast ease-standard hover:text-ink">
          {t("Courses")}
        </Link>
        <span aria-hidden className="mx-2">/</span>
        <Link
          href={`/courses/${courseId}`}
          className="transition-colors duration-fast ease-standard hover:text-ink"
        >
          {courseTitle}
        </Link>
      </nav>

      <PageHeader
        className="mt-2"
        title={t("Questions")}
        description={bank ? t("{0} questions in this course", bank.total) : undefined}
        actions={
          bank && (
            <Button
              variant="primary"
              onClick={() => setGenerateFor("all")}
              className="whitespace-nowrap"
            >
              {t("Generate questions")}
            </Button>
          )
        }
      />

      {byKind.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {byKind.map((row) => (
            <li
              key={row.kind}
              className="rounded-full border border-line px-3 py-1 text-small text-ink-muted"
            >
              {t(`quiz_kind_${row.kind}`)} · {row.count}
            </li>
          ))}
        </ul>
      )}

      {error && <ErrorState className="mt-6" message={error} />}

      {!error && bank && allItems.length === 0 && (
        <EmptyState
          className="mt-8"
          description={t("This course has no questions yet.")}
          action={
            <Button variant="primary" onClick={() => setGenerateFor("all")}>
              {t("Generate questions")}
            </Button>
          }
        />
      )}

      {!error && chapters.length > 0 && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/*
            Sticky, and deliberately thin: it is an index, not a second column of
            content. On a narrow screen it collapses to a plain list above the
            questions, which is still the fastest way to jump to a chapter.
          */}
          <nav
            aria-label={t("Chapters")}
            className="rounded-surface bg-surface p-4 shadow-raise lg:sticky lg:top-8"
          >
            <h2 className="text-small font-semibold text-ink-muted">{t("Chapters")}</h2>
            <ul className="mt-2 space-y-1">
              {chapters.map((module) => (
                <li key={module.id}>
                  <a
                    href={`#chapter-${module.id}`}
                    className="flex items-baseline justify-between gap-2 rounded-control px-2 py-1.5 text-small text-ink transition-colors hover:bg-surface-sunken hover:text-accent"
                  >
                    <span className="min-w-0 truncate">{module.title}</span>
                    <span className="shrink-0 text-micro text-ink-subtle">
                      {module.lessons.reduce((n, l) => n + l.items.length, 0)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            {chapters.map((module) => {
              const isCollapsed = collapsed.has(module.id);
              const lessons = module.lessons.filter((lesson) => lesson.items.length > 0);
              const count = lessons.reduce((n, l) => n + l.items.length, 0);
              return (
                <section key={module.id} id={`chapter-${module.id}`} className="scroll-mt-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <AntButton
                      type="text"
                      onClick={() => toggle(module.id)}
                      aria-expanded={!isCollapsed}
                      aria-controls={`chapter-body-${module.id}`}
                      className="!px-0 text-subtitle font-semibold hover:text-accent"
                    >
                      <span aria-hidden className="mr-2">{isCollapsed ? "▸" : "▾"}</span>
                      {module.title}
                      <span className="ml-2 text-small font-normal text-ink-muted">
                        {t("{0} questions", count)}
                      </span>
                    </AntButton>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setGenerateFor(`module:${module.id}`)}
                    >
                      {t("Generate for this chapter")}
                    </Button>
                  </div>

                  <div id={`chapter-body-${module.id}`} hidden={isCollapsed}>
                    {lessons.map((lesson) => (
                      <div key={lesson.id} className="mt-4 rounded-surface bg-surface p-6 shadow-raise">
                        <h3 className="text-ui font-medium text-ink-muted">{lesson.title}</h3>
                        <div className="mt-3">
                          <QuizSection
                            quiz={lesson.items.map(toQuizItem)}
                            progress={progress}
                            courseId={courseId}
                            renderItemAction={(item) => (
                              <VariantButton
                                courseId={courseId}
                                itemId={item.id}
                                onCreated={load}
                              />
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {!error && !bank && <p className="mt-6 text-small text-ink-muted">{t("Loading…")}</p>}

      {generateFor && bank && (
        <QuizGenerateDialog
          courseId={courseId}
          scopes={scopes}
          initialScope={generateFor}
          onClose={() => setGenerateFor(null)}
          onGenerated={load}
        />
      )}
    </main>
  );
}