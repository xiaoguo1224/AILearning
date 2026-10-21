"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { cancelJob, getJob, type Job } from "@/lib/api";

/**
 * Polls a background job and renders its progress bar. The job keeps running
 * on the server even if the learner navigates away; reopening this component
 * (or the jobs list) reconnects to the live progress.
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const next = await getJob(jobId as string);
        if (cancelled) return;
        setJob(next);
        setError(null);
        if (["completed", "failed", "cancelled"].includes(next.status) && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    }

    void poll();
    timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [jobId]);

  return { job, error };
}

export function JobProgressBar({ job }: { job: Job }) {
  const { t } = useI18n();
  const done = job.progress?.done ?? 0;
  const total = job.progress?.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : job.status === "completed" ? 100 : 0;

  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("Progress")}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-small text-ink-muted">
        {job.progress?.stage === "outline" && t("Planning the course outline…")}
        {job.progress?.stage === "lessons" &&
          total > 0 &&
          t("{0} of {1} lessons", done, total)}
        {job.progress?.stage === "generating" && t("Generating…")}
        {job.status === "completed" && t("Done")}
        {job.status === "failed" && (
          <span className="text-danger">{job.error || t("Failed")}</span>
        )}
        {job.status === "cancelled" && t("Cancelled")}
      </p>
    </div>
  );
}

export function JobCancelButton({ jobId, onCancelled }: { jobId: string; onCancelled?: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await cancelJob(jobId);
          onCancelled?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      {t("Cancel")}
    </Button>
  );
}
