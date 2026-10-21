"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, deleteExploreSession } from "@/lib/api";

/**
 * Deleting a session takes its whole transcript, so it asks first.
 *
 * `active` is the session currently open below the list. Deleting that one has to leave
 * the URL, because the page it points at no longer exists; any other row only needs the
 * list re-rendered.
 */
export function ExploreSessionDeleteButton({
  sessionId,
  projectId,
  active,
}: {
  sessionId: number;
  projectId: number;
  active: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await deleteExploreSession(sessionId);
      setConfirming(false);
      if (active) {
        router.push(`/projects/${projectId}/explore`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not delete this session."));
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
        {t("Delete this session and its messages?")}
      </span>
      <Button type="button" variant="danger" size="sm" disabled={pending} onClick={remove}>
        {pending ? t("Deleting…") : t("Delete")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        {t("Cancel")}
      </Button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </span>
  );
}
