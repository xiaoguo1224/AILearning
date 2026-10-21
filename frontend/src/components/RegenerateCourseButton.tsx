"use client";

import { useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { GenerationProgress } from "@/components/GenerationProgress";
import { streamCourseRegeneration } from "@/lib/api";
import type { SourceInput } from "@/lib/types";

/**
 * "Regenerate this course" on the course page. The learner describes what to
 * change (or nothing at all); the AI rebuilds the course from its own lessons
 * plus that feedback, streamed through the same GenerationProgress UI the
 * generate flow uses. The original course is never touched — the backend saves
 * the rebuild as a new course, and done navigates there.
 */
export function RegenerateCourseButton({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [draft, setDraft] = useState("");

  function start() {
    setFeedback(draft);
    setDialogOpen(false);
    setRunning(true);
  }

  if (running) {
    return (
      <GenerationProgress
        sources={[] as SourceInput[]}
        openStream={(signal) => streamCourseRegeneration(courseId, feedback, { signal })}
        onSourceFailures={() => {}}
        onCancel={() => setRunning(false)}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft("");
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
              {t("Not happy with this course? Describe what to change and let the AI rebuild it. The original stays untouched.")}
            </p>
            <label className="mt-4 block text-small font-medium">
              {t("What should change? (optional)")}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
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
                onClick={start}
                className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white"
              >
                {t("Regenerate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
