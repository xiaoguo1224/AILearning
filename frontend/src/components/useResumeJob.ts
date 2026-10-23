"use client";

import { useEffect, useState } from "react";

import { listJobs } from "@/lib/api";

/**
 * The id of a job that is still running for this subject, found again after a reload.
 *
 * Jobs live on the server and survive navigation; what a refresh loses is the id the
 * page was watching, so the panel comes back looking idle while the work is still going.
 * That is worse than cosmetic: an idle-looking control invites a second press, and the
 * second press used to buy a second job. The server now joins an in-flight job instead
 * of starting one, and this hook is the other half — the page re-attaches, so the
 * learner sees the progress they left behind rather than a reset.
 *
 * `resumed` is true only when a live job was actually found, so a caller can open its
 * progress dialog without ever flashing one open on an ordinary visit.
 */
export function useResumeJob(type: string, refType: string, refId: number) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let items;
      try {
        items = (await listJobs(undefined, 100, 0)).items;
      } catch {
        // The page still renders; only the re-attach is lost.
        return;
      }
      if (cancelled) return;
      const live = items.find(
        (job) =>
          job.type === type &&
          job.ref_type === refType &&
          job.ref_id === refId &&
          (job.status === "pending" || job.status === "running"),
      );
      if (!live) return;
      setJobId(live.id);
      setResumed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [type, refType, refId]);

  return { jobId, setJobId, resumed };
}
