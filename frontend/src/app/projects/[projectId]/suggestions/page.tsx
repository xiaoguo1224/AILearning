import Link from "next/link";
import { notFound } from "next/navigation";
import { SuggestionsPanel } from "@/components/SuggestionsPanel";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getProject, listProjects, listProjectReviewTasks, listSuggestions } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { ProjectDetail, ProjectList, ProjectReviewTask, SuggestionList } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>; searchParams: Promise<{ error?: string; offset?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  const query = await searchParams;
  const requested = Number(query.offset);
  const offset = Number.isSafeInteger(requested) && requested > 0 ? requested : 0;
  let project: ProjectDetail | undefined;
  let suggestions: SuggestionList | undefined;
  let choices: ProjectList = { items: [], total: 0 };
  let source: ProjectReviewTask | undefined;
  let error: string | undefined;
  try {
    project = await getProject(id, t.locale);
    suggestions = await listSuggestions(id, offset, t.locale);
    if (query.error && project.status === "active") {
      const tasks = await listProjectReviewTasks(id, t.locale);
      source = tasks.items.find(task => task.latest_error_id === Number(query.error));
      if (source) choices = await listProjects("active", 0, t.locale);
      else error = t("This diagnosis no longer needs review.");
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server.");
  }
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
    <Link href={`/projects/${id}`} className="text-accent underline">{project?.name ?? t("Project")}</Link>
    <PageHeader title={t("Cross-project suggestions")} />
    {error && <ErrorState message={error} />}
    {suggestions && <SuggestionsPanel projectId={id} suggestions={suggestions} source={source} initialChoices={choices} />}
    {suggestions && <nav className="flex gap-4 text-accent underline" aria-label={t("Pagination")}>
      {offset > 0 && <Link href={`/projects/${id}/suggestions?offset=${Math.max(0, offset - 50)}`}>{t("Previous")}</Link>}
      {offset + 50 < suggestions.total && <Link href={`/projects/${id}/suggestions?offset=${offset + 50}`}>{t("Next")}</Link>}
    </nav>}
  </main>;
}
