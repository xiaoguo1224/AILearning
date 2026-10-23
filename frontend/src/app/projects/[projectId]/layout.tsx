import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectTabs } from "@/components/ProjectTabs";
import { Badge } from "@/components/ui/Badge";
import { ApiError, getProject } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";

/**
 * Project workspace shell: back link, project header, and the section tab bar.
 * Sub-pages render only their own content; the redundant per-page breadcrumbs
 * and project titles live here once.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();

  let name: string | undefined;
  let goal: string | undefined;
  let status: string | undefined;
  try {
    const project = await getProject(id, t.locale);
    name = project.name;
    goal = project.goal;
    status = project.status;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    // Backend unreachable: render the shell with a generic title so sub-pages
    // can still show their own error states.
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <Link
        href="/projects"
        className="text-small text-ink-subtle transition-colors duration-fast ease-standard hover:text-ink"
      >
        ← {t("All projects")}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-display">{name ?? t("Project")}</h1>
        {status && <Badge>{t(status === "active" ? "Active" : "Archived")}</Badge>}
      </div>
      {goal && <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-ui text-ink-muted">{goal}</p>}
      <div className="mt-6 border-b border-line">
        <ProjectTabs projectId={id} />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
