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
  startLessonRegenJob,
  type LessonDraft,
} from "@/lib/api";

/**
 * "Regenerate this lesson" on the lesson page.
 *
 * Starts a background job (POST /api/lessons/{id}/regenerate/job) and polls
 * for progress. The job keeps running if the learner navigates away; reopening
 * the dialog reconnects to the live job. The draft previews editable, and
 * 采用 / 不采用 decides. Nothing is saved until 采用.
 */
export function RegenerateLessonButton({ lessonId }: { lessonId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const { job } = useJob(dialogOpen ? jobId : null);
  const [adopting, setAdopting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft: LessonDraft | null =
    job?.status === "completed"
      ? (job.result?.draft as LessonDraft | undefined) ?? null
      : null;

  async function start() {
    setError(null);
    setJobId(null);
    try {
      const { job_id } = await startLessonRegenJob(lessonId, feedback.trim());
      setJobId(job_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    }
  }

  function close() {
    setDialogOpen(false);
    // The job keeps running in the background; reopening reconnects.
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
        {t("Regenerate")}
      </Button>
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Regenerate lesson")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-surface bg-surface p-6 shadow-raise"
            onClick={(e) => e.stopPropagation()}
          >
            {!jobId ? (
              <>
                <h3 className="text-subtitle font-semibold">{t("Regenerate lesson")}</h3>
                <p className="mt-1 text-small text-ink-muted">
                  {t("Tell the AI what to change, or leave blank to just rewrite.")}
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
            ) : job && draft ? (
              <>
                <h3 className="text-subtitle font-semibold">{t("Review the draft")}</h3>
                <p className="mt-1 text-small text-ink-muted">
                  {t("Edit it, then adopt or discard. Nothing is saved until you adopt.")}
                </p>
                {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
                <div className="mt-4">
                  <RegenDraftPreview draft={draft} onAdopt={(d) => void adoptWith(d)} onDiscard={close} adopting={adopting} />
                </div>
              </>
            ) : (
              <>
                <h3 className="text-subtitle font-semibold">{t("Regenerating…")}</h3>
                {job && <div className="mt-4"><JobProgressBar job={job} /></div>}
                {error && <p role="alert" className="mt-3 text-small text-danger">{error}</p>}
                {job?.status === "failed" && (
                  <p className="mt-2 text-small text-danger">{job.error}</p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  {jobId && ["pending", "running"].includes(job?.status ?? "") && (
                    <JobCancelButton jobId={jobId} onCancelled={close} />
                  )}
                  <Button variant="secondary" onClick={close}>
                    {t("Close")}
                  </Button>
                </div>
                <p className="mt-2 text-small text-ink-muted">
                  {t("You can close this dialog — the job continues in the background.")}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  async function adoptWith(d: LessonDraft) {
    setAdopting(true);
    try {
      await patchLesson(lessonId, {
        title: d.title,
        content: d.content,
        concepts: d.concepts,
      });
      setDialogOpen(false);
      setJobId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setAdopting(false);
    }
  }
}
