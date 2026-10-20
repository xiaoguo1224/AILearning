import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmissionReviewPanel } from "@/components/SubmissionReviewPanel";
import { VariantPanel } from "@/components/VariantPanel";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getSubmission, listProjectSubmissions } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { getTranslator } from "@/lib/locale-server";
import type { SubmissionDetail, SubmissionList } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; submissionId: string }>;
}) {
  const t = await getTranslator();
  const { projectId, submissionId } = await params;
  const project = Number(projectId);
  const submission = Number(submissionId);
  if (
    !/^\d+$/.test(projectId) ||
    !/^\d+$/.test(submissionId) ||
    !Number.isSafeInteger(project) ||
    !Number.isSafeInteger(submission) ||
    project <= 0 ||
    submission <= 0
  ) {
    notFound();
  }

  let detail: SubmissionDetail | undefined;
  let error: string | undefined;
  let history: SubmissionList | undefined;

  try {
    detail = await getSubmission(submission, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  if (detail && detail.exercise_id) {
    try {
      history = await listProjectSubmissions(
        detail.project_id,
        { exerciseId: detail.exercise_id, limit: 50 },
        t.locale,
      );
    } catch {
      // Version history is a convenience; the submission itself still renders.
      history = undefined;
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
      <div className="flex flex-wrap items-center gap-4 text-small">
        <Link href={`/projects/${project}/submissions`} className="text-accent underline">
          {t("Back to submissions")}
        </Link>
        <Link href={`/projects/${project}`} className="text-accent underline">
          {t("Back to project")}
        </Link>
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : (
        detail && (
          <>
            <PageHeader
              title={t("Submission v{0}", detail.version)}
              description={detail.exercise_id ?? t("No exercise linked")}
              actions={
                <Badge tone={detail.status === "reviewed" ? "success" : "neutral"}>
                  {t(detail.status === "reviewed" ? "Reviewed" : "Submitted")}
                </Badge>
              }
            />

            {detail.user_note && (
              <p className="whitespace-pre-wrap text-small text-ink-muted">{detail.user_note}</p>
            )}

            {detail.privacy_warnings.length > 0 && (
              <section className="space-y-1 rounded-surface border border-warning bg-warning-surface p-4">
                <h2 className="text-ui font-medium text-warning">
                  {t("Check for secrets before sharing this further")}
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-small text-ink">
                  {detail.privacy_warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-title">{t("Uploaded files")}</h2>
              {detail.artifacts.map((artifact) => (
                <div key={artifact.id} className="space-y-2 rounded-surface border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-ui text-ink">{artifact.filename}</span>
                      <Badge tone="neutral">{t(artifact.kind)}</Badge>
                    </div>
                    <span className="text-micro text-ink-muted">{formatBytes(artifact.size_bytes)}</span>
                  </div>
                  {artifact.content === null ? (
                    <p className="text-small text-ink-muted">{t("This file could not be read back.")}</p>
                  ) : (
                    <pre className="max-h-96 overflow-auto rounded-control bg-surface-sunken p-3 text-small">
                      {artifact.content}
                    </pre>
                  )}
                  {artifact.truncated && (
                    <p className="text-micro text-ink-muted">
                      {t("Preview shortened; the stored copy is longer.")}
                    </p>
                  )}
                </div>
              ))}
            </section>

            <SubmissionReviewPanel submissionId={detail.id} initialReviews={detail.reviews} />

            <VariantPanel submissionId={detail.id} projectId={detail.project_id} />

            {history && history.items.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-title">{t("Version history")}</h2>
                <ul className="divide-y divide-line rounded-surface border border-line">
                  {history.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 p-3 text-small">
                      <span className="flex items-center gap-2">
                        <Badge tone={item.id === detail.id ? "success" : "neutral"}>
                          {t("v{0}", item.version)}
                        </Badge>
                        <span className="text-ink-muted">{item.status}</span>
                      </span>
                      {item.id === detail.id ? (
                        <span className="text-micro text-ink-muted">{t("This one")}</span>
                      ) : (
                        <Link
                          href={`/projects/${project}/submissions/${item.id}`}
                          className="text-accent underline"
                        >
                          {t("Open")}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )
      )}
    </main>
  );
}
