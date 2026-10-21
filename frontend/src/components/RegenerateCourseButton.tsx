"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button as AntButton, Collapse, Input, Modal, Tag } from "antd";
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
      <Modal
        open={dialogOpen}
        onCancel={close}
        title={!jobId ? t("Regenerate course") : done ? t("Regeneration complete") : t("Regenerating…")}
        width={900}
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
            <p>{t("Each lesson is rewritten separately. You review and adopt each one.")}</p>
            {error && <Alert type="error" message={error} showIcon style={{ marginTop: 12 }} />}
            <Input.TextArea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder={t("e.g. more examples, simpler language…")}
              style={{ marginTop: 12 }}
            />
          </>
        ) : (
          <>
            {job && <JobProgressBar job={job} />}
            {job?.status === "failed" && <Alert type="error" message={job.error} showIcon style={{ marginTop: 12 }} />}
            {drafts.length > 0 && (
              <Collapse style={{ marginTop: 16 }}>
                {drafts.map((entry) => (
                  <Collapse.Panel
                    key={entry.lesson_id}
                    header={
                      <span>
                        {entry.title}
                        {adopted.has(entry.lesson_id) && (
                          <Tag color="success" style={{ marginLeft: 8 }}>{t("Adopted")}</Tag>
                        )}
                      </span>
                    }
                  >
                    {entry.error && !entry.draft && (
                      <Alert type="error" message={entry.error} showIcon style={{ marginBottom: 12 }} />
                    )}
                    {entry.draft && (
                      <RegenDraftPreview
                        draft={entry.draft}
                        onAdopt={(d) => void adopt(entry, d)}
                        onDiscard={() => toggleExpanded(entry.lesson_id)}
                        adopting={adopting === entry.lesson_id}
                      />
                    )}
                  </Collapse.Panel>
                ))}
              </Collapse>
            )}
            {!done && (
              <p style={{ marginTop: 12 }}>
                {t("You can close this dialog — the job continues in the background.")}
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
