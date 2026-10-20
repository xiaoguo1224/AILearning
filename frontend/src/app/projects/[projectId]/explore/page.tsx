import Link from "next/link";
import { notFound } from "next/navigation";

import { ExploreChat } from "@/components/ExploreChat";
import { ExploreSessionDeleteButton } from "@/components/ExploreSessionDeleteButton";
import { NewExploreSessionButton } from "@/components/NewExploreSessionButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getExploreSession, getProject, listProjectSessions } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { ExploreSessionDetail, ExploreSessionList, ProjectDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

/**
 * Free exploration inside one project: the session list, and the conversation the URL
 * selects.
 *
 * THE SELECTED SESSION LIVES IN THE QUERY STRING, `?session=<id>`, rather than in its own
 * route segment. A session belongs to exactly one project, so its project is already in
 * the path; a second id in the path would let the two disagree, and this page would have
 * to decide which one it trusted. The query string cannot disagree with the path, and
 * the list rows are ordinary links, so the whole page still renders on the server.
 *
 * The transcript is server-rendered for the same reason: reopening a session months
 * later should show it before any JavaScript runs.
 */
export default async function ProjectExplorePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();

  const requested = Number((await searchParams).session);
  const sessionId = Number.isSafeInteger(requested) && requested > 0 ? requested : undefined;

  let project: ProjectDetail | undefined;
  let error: string | undefined;
  let sessions: ExploreSessionList | undefined;
  let listError: string | undefined;
  let detail: ExploreSessionDetail | undefined;
  let detailError: string | undefined;

  try {
    project = await getProject(id, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  if (project) {
    try {
      sessions = await listProjectSessions(id, { limit: 50 }, t.locale);
    } catch (err) {
      listError = err instanceof ApiError ? err.message : t("Could not load sessions.");
    }
  }

  if (project && sessionId) {
    try {
      const loaded = await getExploreSession(sessionId, t.locale);
      // A session id belonging to another project is treated as absent rather than
      // drawn: the header names this project, and a conversation from elsewhere under it
      // would read as this project's own material.
      if (loaded.project_id === project.id) detail = loaded;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        detailError = t("Session not found.");
      } else {
        detailError = err instanceof ApiError ? err.message : t("Could not load this session.");
      }
    }
  }

  const archived = project?.status === "archived";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
      <div className="flex flex-wrap items-center gap-4 text-small">
        <Link href={`/projects/${id}`} className="text-accent underline">
          {t("Back to project")}
        </Link>
        <Link href="/projects" className="text-accent underline">
          {t("All projects")}
        </Link>
      </div>

      <PageHeader
        title={t("Free exploration")}
        description={
          project
            ? t("Questions about {0}", project.name)
            : t("Ask questions against this project's own material.")
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
                {t("This project is archived, so free exploration is read-only.")}
              </p>
            )}

            {detailError && <ErrorState message={detailError} />}

            {detail && (
              <section className="space-y-4 rounded-surface border border-line p-6">
                <div className="space-y-1">
                  <h2 className="break-words text-title">
                    {detail.title || t("Untitled session")}
                  </h2>
                  <p className="text-micro text-ink-muted">
                    {t("Started {0}", formatWhen(detail.created_at, t.locale))}
                  </p>
                </div>
                {/* Keyed on the id so switching sessions remounts the transcript rather
                    than reusing the previous one's state. */}
                <ExploreChat
                  key={detail.id}
                  sessionId={detail.id}
                  projectId={id}
                  initialMessages={detail.messages}
                  readOnly={Boolean(archived)}
                />
              </section>
            )}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-title">{t("Sessions")}</h2>
                {!archived && <NewExploreSessionButton projectId={id} />}
              </div>

              {listError ? (
                <ErrorState message={listError} />
              ) : !sessions || sessions.items.length === 0 ? (
                <EmptyState
                  title={t("No sessions yet")}
                  description={t("Start a session and ask a question about this project's material.")}
                />
              ) : (
                <ul className="divide-y divide-line rounded-surface border border-line">
                  {sessions.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 space-y-1">
                        <Link
                          href={`/projects/${id}/explore?session=${item.id}`}
                          className="break-words text-ui text-accent underline"
                        >
                          {item.title || t("Untitled session")}
                        </Link>
                        <p className="text-micro text-ink-muted">
                          {t("Started {0}", formatWhen(item.created_at, t.locale))} ·{" "}
                          {t("{0} messages", item.message_count)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {item.id === detail?.id && <Badge tone="success">{t("Open now")}</Badge>}
                        {!archived && (
                          <ExploreSessionDeleteButton
                            sessionId={item.id}
                            projectId={id}
                            active={item.id === detail?.id}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )
      )}
    </main>
  );
}
