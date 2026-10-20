"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { deleteSubmission } from "@/lib/api";

/**
 * Deleting a submission removes its artifacts and reviews, so it asks first and says
 * what goes with it. The API is the same one a later privacy screen would use.
 */
export function SubmissionDeleteButton({ submissionId }: { submissionId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteSubmission(submissionId);
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not delete this submission."));
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {t("Delete")}
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-micro text-ink-muted">
        {t("Delete this version with its files and reviews?")}
      </span>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={remove}>
        {pending ? t("Deleting...") : t("Delete")}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
        {t("Cancel")}
      </Button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </span>
  );
}
