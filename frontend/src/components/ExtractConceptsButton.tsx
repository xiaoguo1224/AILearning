"use client";

import { Button } from "antd";
import { useEffect, useState } from "react";

import { getJob, listJobs } from "@/lib/api";

interface ExtractConceptsButtonProps {
  courseId: number;
}

/**
 * Manually trigger AI concept extraction for a course.
 * Used when auto-extraction didn't run (e.g. course imported before the feature).
 */
export function ExtractConceptsButton({ courseId }: ExtractConceptsButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, resume polling if an extraction is already running.
  useEffect(() => {
    let cancelled = false;
    listJobs()
      .then(({ items }) => {
        if (cancelled) return;
        const running = items.find(
          (j) =>
            j.type === "concept_extract" &&
            (j.status === "pending" || j.status === "running") &&
            j.ref_id === courseId,
        );
        if (running) {
          setBusy(true);
          void pollJob(running.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  async function pollJob(jobId: string) {
    for (let i = 0; i < 60; i++) {
      const job = await getJob(jobId);
      if (job.status === "completed") {
        window.location.reload();
        return;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error || "提取失败");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setBusy(false);
  }

  async function extract() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/concepts/extract/job`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job_id } = await res.json();
      await pollJob(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提取失败");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      <Button type="primary" loading={busy} disabled={busy} onClick={() => void extract()}>
        AI 提炼知识点
      </Button>
      {error && <p style={{ color: "#f5222d", marginTop: 8, fontSize: 12 }}>{error}</p>}
    </div>
  );
}
