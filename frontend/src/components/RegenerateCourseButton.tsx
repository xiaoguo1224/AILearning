"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { RegenDraftPreview } from "@/components/RegenDraftPreview";
import {
  ApiError,
  patchLesson,
  streamCourseRegeneration,
  type GenerationStreamEvent,
  type LessonDraft,
} from "@/lib/api";

interface LessonRegenState {
  lesson_id: number;
  title: string;
  status: "waiting" | "generating" | "done" | "failed" | "adopted" | "discarded";
  draft: LessonDraft | null;
  error: string | null;
  expanded: boolean;
  adopting: boolean;
}

/**
 * "Regenerate course" on the course page, rebuilt around per-lesson adoption.
 *
 * The backend streams one draft per lesson (nothing is saved). Each lesson
 * lands in the list below as its draft arrives; the learner expands it,
 * optionally edits, and adopts or discards it. Adopting PATCHes that lesson
 * in place — the course is never cloned.
 */
export function RegenerateCourseButton({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [running, setRunning] = useState(false);
  const [lessons, setLessons] = useState<LessonRegenState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function patch(id: number, update: Partial<LessonRegenState>) {
    setLessons((prev) => prev.map((l) => (l.lesson_id === id ? { ...l, ...update } : l)));
  }

  async function start() {
    setDialogOpen(false);
    setRunning(true);
    setError(null);
    setLessons([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const stream = streamCourseRegeneration(courseId, feedback, { signal: controller.signal });
      for await (const event of stream) {
        handleEvent(event);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleEvent(event: GenerationStreamEvent) {
    if (event.type === "lesson_start") {
      setLessons((prev) => [
        ...prev,
        {
          lesson_id: event.lesson_id,
          title: event.title,
          status: "generating",
          draft: null,
          error: null,
          expanded: false,
          adopting: false,
        },
      ]);
    } else if (event.type === "lesson_draft") {
      patch(event.lesson_id, { status: "done", draft: event.draft, expanded: true });
    } else if (event.type === "regen_lesson_failed") {
      patch(event.lesson_id, { status: "failed", error: event.error });
    } else if (event.type === "error") {
      setError(event.message || event.error);
    }
    // done: nothing to do; the list is the result.
  }

  async function adopt(id: number, edited: LessonDraft) {
    patch(id, { adopting: true });
    try {
      await patchLesson(id, {
        title: edited.title,
        content: edited.content,
        concepts: edited.concepts,
      });
      patch(id, { status: "adopted", adopting: false, expanded: false });
      router.refresh();
    } catch (err) {
      patch(id, {
        adopting: false,
        error: err instanceof ApiError ? err.message : t("Could not reach the server."),
      });
    }
  }

  function discard(id: number) {
    patch(id, { status: "discarded", expanded: false });
  }

  const doneCount = lessons.filter((l) =>
    ["done", "adopted", "discarded", "failed"].includes(l.status),
  ).length;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFeedback("");
          setDialogOpen(true);
        }}
        className="rounded-control border border-line px-4 py-2 text-ui text-ink-muted transition-colors hover:text-ink"
      >
        {t("Regenerate course")}
      </button>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Regenerate course")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-surface border border-line bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-subtitle font-semibold">{t("Regenerate course")}</h2>
            <p className="mt-1 text-small text-ink-muted">
              {t("The AI rewrites each lesson from its own content. You review every lesson's draft and adopt or discard it — nothing is saved until you adopt.")}
            </p>
            <label className="mt-4 block text-small font-medium">
              {t("What should change? (optional)")}
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("e.g. too hard, add more examples on attention")}
                className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-control border border-line px-4 py-2 text-ui"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white"
              >
                {t("Regenerate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {(running || lessons.length > 0) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Regenerate course")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-surface bg-surface p-6 shadow-raise">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-subtitle font-semibold">
                {t("Regenerate course")}
                {lessons.length > 0 && (
                  <span className="ml-2 text-small font-normal text-ink-muted">
                    {t("{0} of {1} lessons", doneCount, lessons.length)}
                  </span>
                )}
              </h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  abortRef.current?.abort();
                  setRunning(false);
                  setLessons([]);
                  setError(null);
                }}
              >
                {t("Close")}
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-small text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
              {lessons.map((l) => (
                <div key={l.lesson_id} className="rounded-control border border-line p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => patch(l.lesson_id, { expanded: !l.expanded })}
                    aria-expanded={l.expanded}
                  >
                    <span className="text-small font-medium">
                      <span aria-hidden className="mr-1 text-ink-muted">
                        {l.expanded ? "▾" : "▸"}
                      </span>
                      {l.title}
                    </span>
                    <span className="shrink-0 text-micro text-ink-muted">
                      {l.status === "generating" && t("Generating…")}
                      {l.status === "done" && t("Draft ready")}
                      {l.status === "failed" && t("Failed")}
                      {l.status === "adopted" && t("Adopted")}
                      {l.status === "discarded" && t("Discarded")}
                    </span>
                  </button>
                  {l.expanded && l.draft && l.status === "done" && (
                    <div className="mt-3">
                      <RegenDraftPreview
                        draft={l.draft}
                        adopting={l.adopting}
                        onAdopt={(edited) => void adopt(l.lesson_id, edited)}
                        onDiscard={() => discard(l.lesson_id)}
                      />
                    </div>
                  )}
                  {l.expanded && l.status === "failed" && (
                    <p className="mt-2 text-small text-danger">
                      {l.error || t("Generation failed.")}
                    </p>
                  )}
                </div>
              ))}
              {running && lessons.length === 0 && (
                <p className="text-small text-ink-muted">{t("Starting…")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
