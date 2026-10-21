import Link from "next/link";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, listProjects } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: {
  searchParams: Promise<{ status?: string; offset?: string }>;
}) {
  const t = await getTranslator();
  const query = await searchParams;
  const status = query.status === "archived" ? "archived" : "active";
  const candidate = Number(query.offset ?? 0);
  const offset = Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  let projects;
  let error;
  try { projects = await listProjects(status, offset, t.locale); }
  catch (err) { error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?"); }
  return <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-12">
    <PageHeader title={t("Projects")} description={t("Organize courses and learning materials around your goals.")} />
    <nav aria-label={t("Project status")} className="flex gap-5">
      <Link href="/projects" aria-current={status === "active" ? "page" : undefined} className="text-accent underline">{t("Active projects")}</Link>
      <Link href="/projects?status=archived" aria-current={status === "archived" ? "page" : undefined} className="text-accent underline">{t("Archived projects")}</Link>
    </nav>
    {error ? <ErrorState message={error} /> : projects && <>
      {projects.items.length === 0 ? <EmptyState title={t("No projects in this view.")} description={t(status === "active" ? "Create a project below to begin." : "Archived projects will appear here.")} /> :
        <ul className="grid gap-4 sm:grid-cols-2">{projects.items.map(project => <li key={project.id}><Card><Link href={`/projects/${project.id}`} className="block space-y-2"><h2 className="break-words text-title">{project.name}</h2><p className="line-clamp-3 whitespace-pre-wrap break-words text-small text-ink-muted">{project.goal}</p><span className="text-small text-accent">{t("Open project")}</span></Link></Card></li>)}</ul>}
      <nav aria-label={t("Project pages")} className="flex gap-5">
        {offset > 0 && <Link href={`/projects?status=${status}&offset=${Math.max(0, offset - 20)}`} className="text-accent underline">{t("Previous")}</Link>}
        {offset + 20 < projects.total && <Link href={`/projects?status=${status}&offset=${offset + 20}`} className="text-accent underline">{t("Next")}</Link>}
      </nav>
    </>}
    {status === "active" && <section className="space-y-4 border-t border-line pt-8"><h2 className="text-title">{t("Create project")}</h2><ProjectWorkspace /></section>}
  </main>;
}
