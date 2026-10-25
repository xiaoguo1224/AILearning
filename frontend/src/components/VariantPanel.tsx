"use client";

import { AnswerHistory } from "@/components/AnswerHistory";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { createVariant } from "@/lib/api";
import type { VariantDraft } from "@/lib/types";

/**
 * Drafts a variant of the exercise this submission practises. The result is a draft,
 * not course material: the card says so, and the follow-up submission links back to it.
 */
export function VariantPanel({
  submissionId,
  projectId,
}: {
  submissionId: number;
  projectId: number;
}) {
  const { t } = useI18n();
  const [variant, setVariant] = useState<VariantDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setPending(true);
    setError(null);
    try {
      setVariant(await createVariant(submissionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not draft a variant."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-surface border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-title">{t("Practice a variant")}</h2>
          <p className="text-small text-ink-muted">
            {t("A similar exercise on the same knowledge point, with the numbers changed.")}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={draft}>
          {pending ? t("Drafting...") : t("Draft a variant (uses model budget)")}
        </Button>
      </div>

      {error && <ErrorState message={error} />}

      {variant && (
        <article className="space-y-2 rounded-control border border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{t("Draft, unreviewed")}</Badge>
            <h3 className="text-ui font-medium text-ink">{variant.title}</h3>
          </div>
          <AnswerHistory variantId={variant.id} />
          <p className="whitespace-pre-wrap text-ui text-ink">{variant.prompt}</p>
          {variant.starter_code && (
            <pre className="overflow-x-auto rounded-control bg-surface-sunken p-3 text-small">
              {variant.starter_code}
            </pre>
          )}
          {variant.acceptance && (
            <p className="text-small text-ink-muted">
              {t("Acceptance: {0}", variant.acceptance)}
            </p>
          )}
          <Link
            href={`/projects/${projectId}/submissions?variant=${variant.id}`}
            className="text-small text-accent underline"
          >
            {t("Practise this and submit again")}
          </Link>
        </article>
      )}
    </section>
  );
}
