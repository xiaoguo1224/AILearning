"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, confirmKnowledge } from "@/lib/api";

/**
 * Confirm one entry, which is a separate act from editing it.
 *
 * Deliberately not folded into the save button above: an edit is what a person wrote and
 * a confirmation is what a person vouched for, and the whole point of the review step is
 * that those are two decisions. The server keeps them apart too — confirmation is its own
 * endpoint, is idempotent, and writes its own version snapshot.
 *
 * The caller renders this only for an entry that is not already confirmed and only for a
 * project that is not archived; the server refuses the archived case anyway, so a stray
 * click would surface its own message rather than a silent no-op.
 */
export function KnowledgeConfirmButton({ knowledgeId, updatedAt }: { knowledgeId: number; updatedAt: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = saving || refreshing;
  const lock = useRef(false);

  async function confirm() {
    if (lock.current || pending) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    try {
      await confirmKnowledge(knowledgeId, undefined, updatedAt);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not confirm this entry."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-small text-ink-muted">{t("Confirmation applies to the saved entry. Save edits before confirming.")}</p>
      <Button type="button" onClick={() => void confirm()} disabled={pending}>
        {pending ? t("Confirming…") : t("Confirm")}
      </Button>
      {error && (
        <span role="alert" className="text-small text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
