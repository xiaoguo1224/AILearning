"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { QuizMarkdown } from "@/components/QuizMarkdown";
import { CopyCodeBlock } from "@/components/CopyCodeBlock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { ContentReviewButton } from "@/components/ContentReviewButton";
import {
  revealReviewHint,
  revealReviewSolution,
  getJob, getSubmission, startReviewJob,
} from "@/lib/api";
import type {
  CodeReviewSummary,
  EvidenceType,
  Finding,
  ReferenceSolution,
  ReviewHint,
} from "@/lib/types";

const EVIDENCE_TONE: Record<EvidenceType, "neutral" | "success" | "warning" | "danger"> = {
  confirmed_static: "success",
  user_reported: "warning",
  inferred: "neutral",
  needs_local_check: "danger",
};

const EVIDENCE_COPY: Record<EvidenceType, string> = {
  confirmed_static: "Provable from the code",
  user_reported: "Your log reports this",
  inferred: "AI inference",
  needs_local_check: "Needs a local check",
};

function FindingRow({ finding, evidence }: { finding: Finding; evidence?: { projectId: number; review_id: number; finding_index: number } }) {
  const { t } = useI18n();
  return (
    <li className="space-y-1 rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={EVIDENCE_TONE[finding.evidence_type]}>
          {t(EVIDENCE_COPY[finding.evidence_type])}
        </Badge>
        <Badge tone={finding.severity === "error" ? "danger" : "neutral"}>
          {t(finding.severity === "error" ? "Error" : finding.severity === "warning" ? "Warning" : "Info")}
        </Badge>
        <span className="font-mono text-micro text-ink-muted">
          {finding.file}:{finding.line_start}
          {finding.line_end > finding.line_start ? `-${finding.line_end}` : ""}
        </span>
      </div>
      <QuizMarkdown content={finding.description} />
      <QuizMarkdown content={finding.suggestion} />
      {evidence && finding.severity !== "info" && finding.evidence_type !== "needs_local_check" && (
        <details><summary>{t("Record diagnosis")}</summary><DiagnosisForm projectId={evidence.projectId} evidence={{ review_id: evidence.review_id, finding_index: evidence.finding_index }} /></details>
      )}
    </li>
  );
}

/**
 * Review controls for one submission. The ladder and the reference solution are both
 * behind an explicit action: a review response deliberately carries only the first
 * hint, so nothing here can hand the learner the answer by rendering.
 */
export function SubmissionReviewPanel({
  submissionId,
  initialReviews,
  projectId,
}: {
  submissionId: number;
  initialReviews: CodeReviewSummary[];
  projectId?: number;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [reviews, setReviews] = useState<CodeReviewSummary[]>(initialReviews);
  const [pending, setPending] = useState<"llm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [unlocked, setUnlocked] = useState<Record<number, number>>({});
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [solutions, setSolutions] = useState<Record<number, ReferenceSolution>>({});

  const review = reviews[0];

  async function runReview(useLlm: boolean) {
    setPending("llm");
    setError(null);
    try {
      const { job_id } = await startReviewJob(submissionId, useLlm);
      // Poll until the job finishes; the job survives navigation.
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await getJob(job_id);
        if (job.status === "completed") {
          const detail = await getSubmission(submissionId);
          setReviews(detail.reviews);
          setHints({});
          setUnlocked({});
          setConfirmSolution(false);
          router.refresh();
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error || t("The review could not be completed."));
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("The review could not be completed."));
    } finally {
      setPending(null);
    }
  }

  async function unlockHint(reviewId: number, level: 1 | 2 | 3) {
    setError(null);
    try {
      const hint: ReviewHint = await revealReviewHint(reviewId, level);
      setHints((current) => ({ ...current, [`${reviewId}-${level}`]: hint.text }));
      setUnlocked((current) => ({ ...current, [reviewId]: hint.revealed }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("That hint is not available."));
    }
  }

  async function showSolution(reviewId: number) {
    setError(null);
    try {
      const solution = await revealReviewSolution(reviewId);
      setSolutions((current) => ({ ...current, [reviewId]: solution }));
      setConfirmSolution(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No reference solution is stored."));
    }
  }

  const revealedLevel = review ? unlocked[review.id] ?? review.hints_revealed ?? 1 : 1;

  return (
    <section className="space-y-4 rounded-surface border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-title">{t("Review")}</h2>
          <p className="text-small text-ink-muted">
            {t(
              "The AI reads your code and the log you supplied. The server did not run your code.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="tinted"
            size="sm"
            disabled={pending !== null || review?.llm_status === "used"}
            onClick={() => runReview(true)}
          >
            {pending === "llm" ? t("Asking the model...") : review?.llm_status === "used" ? t("Saved AI review") : t("AI review (uses model budget)")}
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {!review ? (
        <p className="text-small text-ink-muted">
          {t("No review yet. Request an AI review when you are ready.")}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
            <Badge tone="neutral">
              {review.llm_status === "used"
                ? t("AI review")
                : review.llm_status === "unavailable"
                  ? t("Static only (model unavailable)")
                  : t("Static only")}
            </Badge>
            <span>{review.model}</span>
          </div>

          <QuizMarkdown content={review.summary} />

          {review.findings.length === 0 ? (
            <p className="text-small text-ink-muted">{t("No findings.")}</p>
          ) : (
            <ul className="space-y-2">
              {review.findings.map((finding, index) => (
                <FindingRow key={`${finding.file}-${finding.line_start}-${index}`} finding={finding} evidence={projectId ? { projectId, review_id: review.id, finding_index: index } : undefined} />
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-line pt-4">
            <h3 className="text-ui font-medium text-ink">{t("Hints")}</h3>
            <p className="whitespace-pre-wrap text-small text-ink">
              <span className="mr-2 text-ink-muted">{t("Level 1")}</span>
              {review.hint_level_1 ?? t("No hint for this review.")}
            </p>

            {[2, 3].map((level) => {
              const key = `${review.id}-${level}`;
              const text = hints[key];
              const canUnlock = revealedLevel < level;
              if (!text && !canUnlock) return null;
              return text ? (
                <p key={key} className="whitespace-pre-wrap text-small text-ink">
                  <span className="mr-2 text-ink-muted">{t(`Level ${level}`)}</span>
                  {text}
                </p>
              ) : (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => unlockHint(review.id, level as 2 | 3)}
                >
                  {t(`Show level ${level} hint`)}
                </Button>
              );
            })}
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <h3 className="text-ui font-medium text-ink">{t("Reference solution")}</h3>
            {solutions[review.id] ? (
              <div className="space-y-2">
                <Badge tone="warning">{t("AI generated, unverified")}</Badge>
                <CopyCodeBlock><code>{solutions[review.id].reference_solution}</code></CopyCodeBlock>
                {projectId && <ContentReviewButton projectId={projectId} kind="solution" sourceId={review.id} />}
              </div>
            ) : confirmSolution ? (
              <div className="space-y-2">
                <p className="text-small text-ink-muted">
                  {t(
                    "This shows a model-written solution that nobody has verified. Try the hints first; you can still ask for it.",
                  )}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="danger" size="sm" onClick={() => showSolution(review.id)}>
                    {t("Yes, show it")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmSolution(false)}>
                    {t("Keep trying")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmSolution(true)}>
                {t("Show reference solution")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
