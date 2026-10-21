import Link from "next/link";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
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
  return <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-10">
    <PageHeader
      title={t("Projects")}
      description={t("Organize courses and learning materials around your goals.")}
      actions={
        <nav aria-label={t("Project status")} className="flex rounded-control border border-line p-0.5 text-small">
          <Link
            href="/projects"
            aria-current={status === "active" ? "page" : undefined}
            className={status === "active"
              ? "rounded-[6px] bg-surface-sunken px-3 py-1 font-medium text-ink"
              : "rounded-[6px] px-3 py-1 text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"}
          >{t("Active")}</Link>
          <Link
            href="/projects?status=archived"
            aria-current={status === "archived" ? "page" : undefined}
            className={status === "archived"
              ? "rounded-[6px] bg-surface-sunken px-3 py-1 font-medium text-ink"
              : "rounded-[6px] px-3 py-1 text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"}
          >{t("Archived")}</Link>
        </nav>
      }
    />
    {error ? <ErrorState message={error} /> : projects && <>
      {projects.items.length === 0 ? <EmptyState title={t("No projects in this view.")} description={t(status === "active" ? "Create a project below to begin." : "Archived projects will appear here.")} /> :
        <ul className="divide-y divide-line overflow-hidden rounded-surface border border-line">
          {projects.items.map(project => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors duration-fast ease-standard hover:bg-surface-sunken"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-subtitle font-semibold text-ink-subtle"
                >
                  {project.name.trim().charAt(0).toUpperCase() || "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-ink">{project.name}</span>
                  {project.goal && <span className="mt-0.5 block truncate text-small text-ink-subtle">{project.goal}</span>}
                </span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-ink-subtle transition-transform duration-fast ease-standard group-hover:translate-x-0.5">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>}
      <nav aria-label={t("Project pages")} className="flex gap-5 text-small">
        {offset > 0 && <Link href={`/projects?status=${status}&offset=${Math.max(0, offset - 20)}`} className="text-accent hover:underline">{t("Previous")}</Link>}
        {offset + 20 < projects.total && <Link href={`/projects?status=${status}&offset=${offset + 20}`} className="text-accent hover:underline">{t("Next")}</Link>}
      </nav>
    </>}
    {status === "active" && <section className="space-y-4 border-t border-line pt-8"><h2 className="text-title">{t("Create project")}</h2><ProjectWorkspace /></section>}
  </main>;
}
