"use client";

import { Button } from "antd";
import { useState } from "react";

import { getJob } from "@/lib/api";

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

  async function extract() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/concepts/extract/job`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job_id } = await res.json();
      for (let i = 0; i < 60; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") {
          window.location.reload();
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error || "提取失败");
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提取失败");
    } finally {
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
