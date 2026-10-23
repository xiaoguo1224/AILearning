import Link from "next/link";
import { notFound } from "next/navigation";

import { ExploreChat } from "@/components/ExploreChat";
import { ExploreSessionDeleteButton } from "@/components/ExploreSessionDeleteButton";
import { NewExploreSessionButton } from "@/components/NewExploreSessionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError, getExploreSession, getProject, listProjectSessions } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";
import { getTranslator } from "@/lib/locale-server";
import type { ExploreSessionDetail, ExploreSessionList, ProjectDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatWhen(value: string, locale: string): string {
  return formatDateTime(value, locale === "en" ? "en" : "zh-CN");
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
  searchParams: Promise<{ session?: string; draft?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();

  const query = await searchParams;
  const requested = Number(query.session);
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

  // Without an explicit ?session=, open the most recent session so the page
  // never shows a dead conversation panel when sessions exist.
  const effectiveSessionId = sessionId ?? sessions?.items[0]?.id;

  if (project && effectiveSessionId) {
    try {
      const loaded = await getExploreSession(effectiveSessionId, t.locale);
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
    <div>
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

            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Session rail */}
              <aside className="w-full shrink-0 lg:w-72">
                {!archived && (
                  <div className="[&>div]:w-full [&_button]:w-full">
                    <NewExploreSessionButton projectId={id} />
                  </div>
                )}
                <h2 className="mt-4 text-micro font-medium uppercase tracking-wider text-ink-subtle">
                  {t("Sessions")}
                </h2>
                <div className="mt-2">
                  {listError ? (
                    <ErrorState message={listError} />
                  ) : !sessions || sessions.items.length === 0 ? (
                    <EmptyState
                      title={t("No sessions yet")}
                      description={t("Start a session and ask a question about this project's material.")}
                    />
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-surface border border-line bg-surface">
                      {sessions.items.map((item) => {
                        const selected = item.id === detail?.id;
                        return (
                          <li key={item.id}>
                            <Link
                              href={`/projects/${id}/explore?session=${item.id}`}
                              aria-current={selected ? "page" : undefined}
                              className={
                                selected
                                  ? "block border-l-2 border-accent bg-surface-sunken px-4 py-3 transition-colors duration-fast ease-standard"
                                  : "block border-l-2 border-transparent px-4 py-3 transition-colors duration-fast ease-standard hover:bg-surface-sunken"
                              }
                            >
                              <span className="block truncate text-small font-medium text-ink">
                                {item.title || t("Untitled session")}
                              </span>
                              <span className="mt-0.5 block text-micro text-ink-subtle">
                                {t("{0} messages", item.message_count)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </aside>

              {/* Conversation */}
              <section className="min-w-0 flex-1">
                {detail ? (
                  <div className="rounded-surface border border-line bg-surface p-6 shadow-raise">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <h2 className="break-words text-title">
                          {detail.title || t("Untitled session")}
                        </h2>
                        <p className="text-micro text-ink-muted">
                          {t("Started {0}", formatWhen(detail.created_at, t.locale))}
                        </p>
                      </div>
                      {!archived && (
                        <ExploreSessionDeleteButton
                          sessionId={detail.id}
                          projectId={id}
                          active={false}
                        />
                      )}
                    </div>
                    {/* Keyed on the id so switching sessions remounts the transcript rather
                        than reusing the previous one's state. */}
                    <div className="mt-4">
                      <ExploreChat
                        initialQuestion={query.draft?.slice(0, 2000)}
                        key={detail.id}
                        sessionId={detail.id}
                        projectId={id}
                        initialMessages={detail.messages}
                        readOnly={Boolean(archived)}
                      />
                    </div>
                  </div>
                ) : (
                  !listError && (
                    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-5 rounded-surface border border-dashed border-line p-8 text-center">
                      <div className="space-y-1.5">
                        <h2 className="text-title">{t("No sessions yet")}</h2>
                        <p className="mx-auto max-w-xs text-small text-ink-muted">
                          {t("Start a session and ask a question about this project's material.")}
                        </p>
                      </div>
                      {!archived && <NewExploreSessionButton projectId={id} />}
                    </div>
                  )
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
