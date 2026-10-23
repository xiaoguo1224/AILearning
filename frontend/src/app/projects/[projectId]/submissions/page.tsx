import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmissionDeleteButton } from "@/components/SubmissionDeleteButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getProject, listProjectSubmissions } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";
import { getTranslator } from "@/lib/locale-server";
import type { ProjectDetail, SubmissionList } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(value: string, locale: string): string {
  return formatDateTime(value, locale === "en" ? "en" : "zh-CN");
}

export default async function ProjectSubmissionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();

  let project: ProjectDetail | undefined;
  let error: string | undefined;
  let submissions: SubmissionList | undefined;
  let listError: string | undefined;

  try {
    project = await getProject(id, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  if (project) {
    try {
      submissions = await listProjectSubmissions(id, { limit: 50 }, t.locale);
    } catch (err) {
      listError = err instanceof ApiError ? err.message : t("Could not load submissions.");
    }
  }

  const archived = project?.status === "archived";

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title={t("Code review")}
        description={
          project
            ? t("Submissions for {0}", project.name)
            : t("Upload code and logs from your own machine for static review.")
        }
        actions={archived ? <Badge>{t("Archived")}</Badge> : undefined}
      />

      {error ? (
        <ErrorState message={error} />
      ) : (
        project && (
          <>
            {archived && (
              <p className="text-small text-ink-muted">
                {t("This project is archived, so submissions are read-only.")}
              </p>
            )}

            <section className="space-y-3">
              <h2 className="text-title">{t("History")}</h2>
              {listError ? (
                <ErrorState message={listError} />
              ) : !submissions || submissions.items.length === 0 ? (
                <EmptyState
                  title={t("No submissions yet")}
                  description={t("Paste code or upload a file below to get a first review.")}
                />
              ) : (
                <ul className="divide-y divide-line rounded-surface border border-line">
                  {submissions.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{t("v{0}", item.version)}</Badge>
                          {item.exercise_id && (
                            <span className="font-mono text-micro text-ink-muted">{item.exercise_id}</span>
                          )}
                          <Badge tone={item.status === "reviewed" ? "success" : "neutral"}>
                            {t(item.status === "reviewed" ? "Reviewed" : "Submitted")}
                          </Badge>
                        </div>
                        <p className="truncate text-small text-ink">
                          {item.user_note || t("No note")}
                        </p>
                        {item.latest_review && (
                          <p className="text-small text-ink-muted">
                            {t("{0} findings", item.latest_review.finding_count)} ·{" "}
                            {item.latest_review.summary}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-micro text-ink-muted">
                          {formatWhen(item.created_at, t.locale)}
                        </span>
                        <Link
                          href={
                            item.quiz_item_id && item.quiz_course_id
                              ? `/courses/${item.quiz_course_id}/quiz/${item.quiz_item_id}`
                              : `/projects/${id}/submissions/${item.id}`
                          }
                          className="text-small text-accent underline"
                        >
                          {t("Open")}
                        </Link>
                        {!archived && <SubmissionDeleteButton submissionId={item.id} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>


          </>
        )
      )}
    </div>
  );
}
