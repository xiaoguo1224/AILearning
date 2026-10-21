import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeConfirmButton } from "@/components/KnowledgeConfirmButton";
import { KnowledgeDiff } from "@/components/KnowledgeDiff";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ApiError,
  compareKnowledge,
  getKnowledge,
  getProject,
  listKnowledgeRevisions,
  listProjectKnowledge,
} from "@/lib/api";
import type { Translator } from "@/lib/i18n";
import {
  knowledgeKindLabel,
  knowledgeProvenanceLine,
  knowledgeRevisionReasonLabel,
  knowledgeStatusLabel,
  knowledgeStatusTone,
} from "@/lib/knowledge";
import { getTranslator } from "@/lib/locale-server";
import type {
  KnowledgeCompare,
  KnowledgeDetail,
  KnowledgeList,
  KnowledgeRelationRef,
  KnowledgeRevisionList,
  KnowledgeStatus,
  ProjectDetail,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: KnowledgeStatus[] = ["draft", "pending_review", "confirmed"];

function formatWhen(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

/**
 * Every state of this page lives in the query string, so a link to one entry, one filter
 * or one comparison is a link somebody else can open.
 *
 * A single builder rather than five hand-written template strings: the filter row has to
 * preserve `core` while dropping `entry`, the version rows have to preserve `entry` while
 * setting `compare`, and one place that knows the spelling of each parameter is what
 * keeps those from drifting apart.
 */
function knowledgeHref(
  projectId: number,
  options: {
    entry?: number;
    status?: KnowledgeStatus;
    core?: boolean;
    compare?: number;
    offset?: number;
  } = {},
): string {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.core) query.set("core", "1");
  if (options.entry !== undefined) query.set("entry", String(options.entry));
  if (options.compare !== undefined) query.set("compare", String(options.compare));
  if (options.offset) query.set("offset", String(options.offset));
  const suffix = query.toString();
  return `/projects/${projectId}/knowledge${suffix ? `?${suffix}` : ""}`;
}

/** The other end of an edge, which is the one worth linking to. */
function otherEnd(relation: KnowledgeRelationRef, entryId: number): number {
  return relation.from_id === entryId ? relation.to_id : relation.from_id;
}

function RelationList({
  heading,
  relations,
  entryId,
  projectId,
  titles,
  t,
}: {
  heading: string;
  relations: KnowledgeRelationRef[];
  entryId: number;
  projectId: number;
  titles: Map<number, string>;
  t: Translator;
}) {
  if (relations.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3 className="text-small font-medium text-ink-muted">{heading}</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
        {relations.map((relation) => {
          const target = otherEnd(relation, entryId);
          return (
            <li key={`${relation.kind}-${relation.from_id}-${relation.to_id}`}>
              <Link href={knowledgeHref(projectId, { entry: target })} className="text-accent underline">
                {titles.get(target) ?? t("Entry #{0}", target)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Knowledge review inside one project: what has been settled, what is waiting, and what
 * changed since the last thing a person signed off.
 *
 * RENDERED ON THE SERVER, WITH THE SELECTION IN THE QUERY STRING. `?entry=<id>` rather
 * than a second path segment, for the reason the explore page gives: an entry belongs to
 * a project, so its project is already in the path, and two ids in the path could
 * disagree. Everything the reader might want to send someone else — the entry, the
 * filter, the version the comparison starts from — is therefore in the URL.
 *
 * ONLY THE MUTATIONS ARE CLIENT COMPONENTS. Reading the list, the entry, its versions and
 * the diff needs no interaction, so it needs no JavaScript: reopening a comparison months
 * later shows it before anything hydrates.
 */
export default async function ProjectKnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ entry?: string; status?: string; core?: string; compare?: string; offset?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();

  const query = await searchParams;
  const requestedOffset = Number(query.offset);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const requestedEntry = Number(query.entry);
  const entryId =
    Number.isSafeInteger(requestedEntry) && requestedEntry > 0 ? requestedEntry : undefined;
  const status = STATUS_FILTERS.includes(query.status as KnowledgeStatus)
    ? (query.status as KnowledgeStatus)
    : undefined;
  // `core=1` is what this page writes; `true` is accepted so a hand-typed URL still works.
  const core = query.core === "1" || query.core === "true";
  const requestedCompare = Number(query.compare);
  const compareFrom =
    Number.isSafeInteger(requestedCompare) && requestedCompare > 0 ? requestedCompare : undefined;

  let project: ProjectDetail | undefined;
  let error: string | undefined;
  let list: KnowledgeList | undefined;
  let listError: string | undefined;
  let detail: KnowledgeDetail | undefined;
  let detailError: string | undefined;
  let revisions: KnowledgeRevisionList | undefined;
  let revisionsError: string | undefined;
  let compare: KnowledgeCompare | undefined;
  let compareError: string | undefined;

  try {
    project = await getProject(id, t.locale);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  if (project) {
    try {
      list = await listProjectKnowledge(id, { status, core, limit: 50, offset }, t.locale);
    } catch (err) {
      listError = err instanceof ApiError ? err.message : t("Could not load knowledge entries.");
    }
  }

  if (project && entryId) {
    try {
      detail = await getKnowledge(entryId, t.locale);
      if (!detail.projects.some(link => link.project_id === id)) {
        detail = undefined;
        detailError = t("That knowledge entry is not part of this project.");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        detailError = t("Knowledge entry not found.");
      } else {
        detailError = err instanceof ApiError ? err.message : t("Could not load this entry.");
      }
    }
  }

  if (detail) {
    try {
      revisions = await listKnowledgeRevisions(detail.id, t.locale);
    } catch (err) {
      revisionsError = err instanceof ApiError ? err.message : t("Could not load versions.");
    }
    try {
      // No version named means the server starts from the last confirmed one, which is
      // the question this screen exists to answer. Naming one is a different question.
      compare = await compareKnowledge(detail.id, compareFrom, t.locale);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        compareError = t("There is no version to compare against.");
      } else {
        compareError = err instanceof ApiError ? err.message : t("Could not compare versions.");
      }
    }
  }

  const archived = project?.status === "archived";
  const titles = new Map((list?.items ?? []).map((item) => [item.id, item.title]));

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title={t("Knowledge")}
        description={t("What this project has settled. Core entries are not treated as settled until you confirm them.")}
        actions={archived ? <Badge>{t("Archived")}</Badge> : undefined}
      />

      {error ? (
        <ErrorState message={error} />
      ) : (
        project && (
          <>
            {archived && (
              <p className="text-small text-ink-muted">
                {t("This project is archived, so the knowledge base is read-only.")}
              </p>
            )}

            {/* Links, not client state: a filter is a place, and a filtered view should
                be sendable. Changing the filter drops `entry`, because an entry outside
                the new filter would sit in a list that claims to exclude it. */}
            <nav aria-label={t("Filter by status")} className="flex flex-wrap items-center gap-3 text-small">
              <Link
                href={knowledgeHref(id, { core })}
                aria-current={status === undefined ? "page" : undefined}
                className={status === undefined ? "font-medium text-ink underline" : "text-accent underline"}
              >
                {t("All")}
              </Link>
              {STATUS_FILTERS.map((value) => (
                <Link
                  key={value}
                  href={knowledgeHref(id, { status: value, core })}
                  aria-current={status === value ? "page" : undefined}
                  className={status === value ? "font-medium text-ink underline" : "text-accent underline"}
                >
                  {knowledgeStatusLabel(value, t)}
                </Link>
              ))}
              <span aria-hidden="true" className="text-ink-subtle">
                |
              </span>
              <Link
                href={knowledgeHref(id, { status, core: !core })}
                aria-current={core ? "page" : undefined}
                className={core ? "font-medium text-ink underline" : "text-accent underline"}
              >
                {core ? t("Show all types") : t("Only core types")}
              </Link>
            </nav>

            {listError ? (
              <ErrorState message={listError} />
            ) : !list || list.items.length === 0 ? (
              <EmptyState
                title={t("No knowledge entries yet")}
                description={t("Notes, definitions and standard answers saved from this project appear here.")}
              />
            ) : (
              <ul className="divide-y divide-line rounded-surface border border-line">
                {list.items.map((item) => (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-start justify-between gap-3 p-4 ${
                      item.id === detail?.id ? "border-l-2 border-accent" : ""
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <Link
                        href={knowledgeHref(id, { entry: item.id, status, core, offset })}
                        className="break-words text-ui text-accent underline"
                      >
                        {item.title}
                      </Link>
                      <p className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
                        <Badge>{knowledgeKindLabel(item.kind, t)}</Badge>
                        <Badge tone={knowledgeStatusTone(item.status)}>
                          {knowledgeStatusLabel(item.status, t)}
                        </Badge>
                        <span>{t("Updated {0}", formatWhen(item.updated_at, t.locale))}</span>
                      </p>
                    </div>
                    {item.id === detail?.id && <Badge tone="success">{t("Open now")}</Badge>}
                  </li>
                ))}
              </ul>
            )}

            {list && (offset > 0 || offset + 50 < list.total) && (
              <nav aria-label={t("Pagination")} className="flex gap-4 text-small text-accent underline">
                {offset > 0 && <Link href={knowledgeHref(id, { status, core, offset: Math.max(0, offset - 50) })}>{t("Previous")}</Link>}
                {offset + 50 < list.total && <Link href={knowledgeHref(id, { status, core, offset: offset + 50 })}>{t("Next")}</Link>}
              </nav>
            )}

            {detailError && <ErrorState message={detailError} />}

            {detail && (
              <>
                <section className="space-y-4 rounded-surface border border-line p-6">
                  <div className="space-y-2">
                    <h2 className="break-words text-title">{detail.title}</h2>
                    <p className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
                      <Badge>{knowledgeKindLabel(detail.kind, t)}</Badge>
                      <Badge tone={knowledgeStatusTone(detail.status)}>
                        {knowledgeStatusLabel(detail.status, t)}
                      </Badge>
                      {detail.confirmed_at && (
                        <span>{t("Confirmed {0}", formatWhen(detail.confirmed_at, t.locale))}</span>
                      )}
                    </p>
                  </div>

                  {detail.status === "pending_review" && (
                    <Callout tone="warning">
                      {t("This entry is waiting for review. It is not a settled answer until you confirm it.")}
                    </Callout>
                  )}

                  {detail.status !== "confirmed" && !archived && (
                    <KnowledgeConfirmButton knowledgeId={detail.id} updatedAt={detail.updated_at} />
                  )}

                  <p className="whitespace-pre-wrap text-ui">{detail.body}</p>

                  {detail.provenance.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="text-small font-medium text-ink-muted">{t("Source")}</h3>
                      <ul className="space-y-1 text-small text-ink-muted">
                        {detail.provenance.map((item, index) => (
                          <li key={index}>{knowledgeProvenanceLine(item, t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.projects.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="text-small font-medium text-ink-muted">{t("Used by")}</h3>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted">
                        {detail.projects.map((ref) => (
                          <li key={ref.project_id}>{ref.name}</li>
                        ))}
                      </ul>
                      {detail.projects.length > 1 && (
                        <p className="text-micro text-ink-muted">
                          {t("This entry is also referenced by other projects.")}
                        </p>
                      )}
                    </div>
                  )}

                  <RelationList
                    heading={t("Prerequisites")}
                    relations={detail.prerequisites}
                    entryId={detail.id}
                    projectId={id}
                    titles={titles}
                    t={t}
                  />
                  <RelationList
                    heading={t("Related")}
                    relations={detail.related}
                    entryId={detail.id}
                    projectId={id}
                    titles={titles}
                    t={t}
                  />

                  {/* Keyed on the id: switching entries must not leave the previous
                      entry's text in the fields, which is what local state would do. */}
                  <KnowledgeEditor key={detail.id} knowledge={detail} readOnly={Boolean(archived)} />
                </section>

                {revisionsError && <ErrorState message={revisionsError} />}

                {revisions && (
                  <section className="space-y-3">
                    <h2 className="text-title">{t("Versions")}</h2>

                    {revisions.confirmed_version === null ? (
                      <p className="text-small text-ink-muted">
                        {t("No version of this entry has been confirmed yet.")}
                      </p>
                    ) : revisions.confirmed_version < revisions.current_version ? (
                      // The whole reason this screen exists, stated in one sentence: the
                      // text on screen is not the text that was signed.
                      <Callout tone="warning">
                        {t(
                          "The confirmed version is v{0}, and the entry has changed since.",
                          revisions.confirmed_version,
                        )}
                      </Callout>
                    ) : null}

                    <ul className="divide-y divide-line rounded-surface border border-line">
                      {revisions.items.map((item) => (
                        <li
                          key={item.version}
                          className={`flex flex-wrap items-center justify-between gap-3 p-3 ${
                            item.version === compare?.from_version ? "border-l-2 border-accent" : ""
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <Link
                              href={knowledgeHref(id, { entry: detail.id, compare: item.version })}
                              className="text-ui text-accent underline"
                            >
                              {t("v{0}", item.version)}
                            </Link>
                            <p className="text-micro text-ink-muted">
                              {knowledgeRevisionReasonLabel(item.reason, t)} ·{" "}
                              {knowledgeStatusLabel(item.status, t)} ·{" "}
                              {t("{0} characters", item.body_chars)} ·{" "}
                              {formatWhen(item.created_at, t.locale)}
                            </p>
                          </div>
                          {item.version === compare?.from_version && (
                            <Badge tone="success">{t("Comparison start")}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {compareError && <ErrorState message={compareError} />}

                {compare && (
                  <section className="space-y-3">
                    <h2 className="text-title">{t("Comparison")}</h2>
                    <KnowledgeDiff compare={compare} />
                  </section>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
