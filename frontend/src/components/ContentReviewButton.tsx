"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, requestContentReview } from "@/lib/api";

export function ContentReviewButton({ projectId, kind, sourceId }: { projectId: number; kind: "lesson" | "solution"; sourceId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function open() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try {
      const result = await requestContentReview(projectId, kind, sourceId);
      router.push(`/projects/${projectId}/knowledge?entry=${result.knowledge_id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : t("Could not prepare the review snapshot.")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-2"><Button variant="secondary" disabled={busy} onClick={() => void open()}>{t(busy ? "Saving…" : kind === "lesson" ? "Review formulas and examples" : "Review this reference solution")}</Button>
    {error && <p role="alert" className="text-danger">{error}</p>}
  </div>;
}
