import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError, getProject, listContentReviews } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { ContentReview, ProjectDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContentReviewsPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>; searchParams: Promise<{ offset?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  const requested = Number((await searchParams).offset);
  const offset = Number.isSafeInteger(requested) && requested > 0 ? requested : 0;
  let project: ProjectDetail | undefined;
  let data: { items: ContentReview[]; total: number } | undefined;
  let error: string | undefined;
  try { project = await getProject(id, t.locale); data = await listContentReviews(id, offset, t.locale); }
  catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server.");
  }
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
    <Link href={`/projects/${id}`} className="text-accent underline">{project?.name ?? t("Project")}</Link>
    <PageHeader title={t("Content review history")} />
    <p>{t("A confirmed snapshot reviews only that exact source version. Editing the source or the review copy requires another check. No code was executed.")}</p>
    {error && <ErrorState message={error} />}
    {data?.items.length === 0 && <p>{t("Prepare a review from a course lesson or an opened reference solution.")}</p>}
    {data?.items.map(item => <article key={item.id} className="space-y-2 rounded-surface border border-line p-4">
      <h2>{t(item.source_kind === "lesson" ? "Lesson {0}" : "Reference review {0}", item.source_id)}</h2>
      <Badge>{t(item.approved ? "Exact source version reviewed" : !item.source_unchanged ? "Source changed or unavailable" : !item.matches_source ? "Review copy differs from source" : "Awaiting content review")}</Badge>
      <p className="font-mono text-small">{item.source_hash.slice(0, 12)}</p>
      <Link href={`/projects/${id}/knowledge?entry=${item.knowledge_id}`} className="text-accent underline">{t("Open review copy")}</Link>
    </article>)}
    {data && <nav aria-label={t("Pagination")} className="flex gap-4 text-accent underline">
      {offset > 0 && <Link href={`/projects/${id}/content-reviews?offset=${Math.max(0, offset - 50)}`}>{t("Previous")}</Link>}
      {offset + 50 < data.total && <Link href={`/projects/${id}/content-reviews?offset=${offset + 50}`}>{t("Next")}</Link>}
    </nav>}
  </main>;
}
