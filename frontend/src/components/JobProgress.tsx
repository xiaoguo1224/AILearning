"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { Button, NoticeBar, Progress, Space, Typography } from "react-vant";
import { cancelJob, getJob, type Job } from "@/lib/api";

/**
 * Polls a background job and renders its progress bar. The job keeps running
 * on the server even if the learner navigates away; reopening this component
 * (or the jobs list) reconnects to the live progress.
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let polling = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      if (polling) return;
      polling = true;
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
      } finally {
        polling = false;
      }
    }

    void poll();
    timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [jobId, refreshKey]);

  return { job: job?.id === jobId ? job : null, error, refresh: () => setRefreshKey(key => key + 1) };
}

export function JobProgressBar({ job }: { job: Job }) {
  const { t } = useI18n();
  const done = job.progress?.done ?? 0;
  const total = job.progress?.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : job.status === "completed" ? 100 : 0;

  return <Space direction="vertical" block>
    <Progress percentage={pct} showPivot={false} />
    <Typography.Text type="secondary">
      {job.progress?.stage === "outline" && t("Planning the course outline…")}
      {job.progress?.stage === "lessons" && total > 0 && t("{0} of {1} lessons", done, total)}
      {job.progress?.stage === "generating" && t("Generating…")}
      {job.status === "awaiting_review" && "等待用户审阅确认"}
      {job.status === "completed" && t("Done")}
      {job.status === "cancelled" && t("Cancelled")}
    </Typography.Text>
    {job.status === "failed" && <NoticeBar color="var(--sf-danger)" text={job.error || t("Failed")} scrollable={false} wrapable />}
  </Space>;
}

export function JobCancelButton({ jobId, onCancelled }: { jobId: string; onCancelled?: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Space direction="vertical">
    <Button size="small" loading={busy} disabled={busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await cancelJob(jobId); onCancelled?.(); }
      catch (err) { setError(err instanceof Error ? err.message : t("Could not reach the server.")); }
      finally { setBusy(false); }
    }}>{t("Cancel")}</Button>
    {error && <NoticeBar text={error} scrollable={false} wrapable />}
  </Space>;
}
