"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button as AntButton, Input, Modal } from "antd";
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
      <Modal
        open={dialogOpen}
        onCancel={close}
        title={!jobId ? t("Regenerate lesson") : job && draft ? t("Review the draft") : t("Regenerating…")}
        width={800}
        footer={
          !jobId
            ? [
                <AntButton key="cancel" onClick={close}>
                  {t("Cancel")}
                </AntButton>,
                <AntButton key="start" type="primary" onClick={() => void start()}>
                  {t("Start")}
                </AntButton>,
              ]
            : job && draft
              ? null
              : [
                  jobId && ["pending", "running"].includes(job?.status ?? "") && (
                    <JobCancelButton key="cancel-job" jobId={jobId} onCancelled={close} />
                  ),
                  <AntButton key="close" onClick={close}>
                    {t("Close")}
                  </AntButton>,
                ]
        }
      >
        {!jobId ? (
          <>
            <p>{t("Tell the AI what to change, or leave blank to just rewrite.")}</p>
            {error && <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />}
            <Input.TextArea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder={t("e.g. more examples, simpler language…")}
              style={{ marginTop: 12 }}
            />
          </>
        ) : job && draft ? (
          <>
            <p>{t("Edit it, then adopt or discard. Nothing is saved until you adopt.")}</p>
            {error && <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />}
            <div style={{ marginTop: 16 }}>
              <RegenDraftPreview draft={draft} onAdopt={(d) => void adoptWith(d)} onDiscard={close} adopting={adopting} />
            </div>
          </>
        ) : (
          <>
            {job && <JobProgressBar job={job} />}
            {error && <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />}
            {job?.status === "failed" && <Alert type="error" message={job.error} showIcon style={{ marginTop: 8 }} />}
            <p style={{ marginTop: 8 }}>
              {t("You can close this dialog — the job continues in the background.")}
            </p>
          </>
        )}
      </Modal>
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
