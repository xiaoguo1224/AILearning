"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { RegenDraftPreview } from "@/components/RegenDraftPreview";
import { JobCancelButton, JobProgressBar, useJob } from "@/components/JobProgress";
import {
  ApiError,
  patchLesson,
  startCourseRegenJob,
  type LessonDraft,
} from "@/lib/api";

interface DraftEntry {
  lesson_id: number;
  title: string;
  draft: LessonDraft | null;
  error: string | null;
}

/**
 * "Regenerate course" on the course page, rebuilt around per-lesson adoption.
 *
 * Starts a background job (POST /api/courses/{id}/regenerate/job) and polls
 * for progress. Drafts land in job.progress.drafts as each lesson finishes;
 * the learner expands each, optionally edits, and adopts or discards it.
 * Adopting PATCHes that lesson in place — the course is never cloned.
 * The job keeps running if the learner navigates away.
 */
export function RegenerateCourseButton({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const { job } = useJob(dialogOpen ? jobId : null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [adopted, setAdopted] = useState<Set<number>>(new Set());
  const [adopting, setAdopting] = useState<number | null>(null);

  const drafts: DraftEntry[] =
    (job?.progress?.drafts as DraftEntry[] | undefined) ??
    (job?.result?.drafts as DraftEntry[] | undefined) ??
    [];

  async function start() {
    setError(null);
    setJobId(null);
    setAdopted(new Set());
    setExpanded(new Set());
    try {
      const { job_id } = await startCourseRegenJob(courseId, feedback.trim());
      setJobId(job_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    }
  }

  async function adopt(entry: DraftEntry, edited: LessonDraft) {
    setAdopting(entry.lesson_id);
    try {
      await patchLesson(entry.lesson_id, {
        title: edited.title,
        content: edited.content,
        concepts: edited.concepts,
      });
      setAdopted((prev) => new Set(prev).add(entry.lesson_id));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setAdopting(null);
    }
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setDialogOpen(false);
    // The job keeps running in the background; reopening reconnects.
  }

  const done = job?.status === "completed" || job?.status === "failed";

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
        {t("Regenerate course")}
      </Button>
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Regenerate course")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-surface bg-surface p-6 shadow-raise"
            onClick={(e) => e.stopPropagation()}
          >
            {!jobId ? (
              <>
                <h3 className="text-subtitle font-semibold">{t("Regenerate course")}</h3>
                <p className="mt-1 text-small text-ink-muted">
                  {t("Each lesson is rewritten separately. You review and adopt each one.")}
                </p>
                {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder={t("e.g. more examples, simpler language…")}
                  className="mt-3 block w-full rounded-control border border-line bg-transparent px-3 py-2 text-small"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={close}>
                    {t("Cancel")}
                  </Button>
                  <Button onClick={() => void start()}>{t("Start")}</Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-subtitle font-semibold">
                  {done ? t("Regeneration complete") : t("Regenerating…")}
                </h3>
                {job && (
                  <div className="mt-4">
                    <JobProgressBar job={job} />
                  </div>
                )}
                {job?.status === "failed" && (
                  <p className="mt-2 text-small text-danger">{job.error}</p>
                )}
                {drafts.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {drafts.map((entry) => (
                      <div key={entry.lesson_id} className="rounded-surface border border-line p-4">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(entry.lesson_id)}
                          aria-expanded={expanded.has(entry.lesson_id)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <span className="text-small font-medium">
                            <span aria-hidden className="mr-1 text-ink-muted">
                              {expanded.has(entry.lesson_id) ? "▾" : "▸"}
                            </span>
                            {entry.title}
                          </span>
                          {adopted.has(entry.lesson_id) && (
                            <span className="text-micro text-success">{t("Adopted")}</span>
                          )}
                        </button>
                        {entry.error && !entry.draft && (
                          <p className="mt-2 text-small text-danger">{entry.error}</p>
                        )}
                        {expanded.has(entry.lesson_id) && entry.draft && (
                          <div className="mt-3">
                            <RegenDraftPreview
                              draft={entry.draft}
                              onAdopt={(d) => void adopt(entry, d)}
                              onDiscard={() => toggleExpanded(entry.lesson_id)}
                              adopting={adopting === entry.lesson_id}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  {jobId && ["pending", "running"].includes(job?.status ?? "") && (
                    <JobCancelButton jobId={jobId} onCancelled={close} />
                  )}
                  <Button variant="secondary" onClick={close}>
                    {t("Close")}
                  </Button>
                </div>
                {!done && (
                  <p className="mt-2 text-small text-ink-muted">
                    {t("You can close this dialog — the job continues in the background.")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
