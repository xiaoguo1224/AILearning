import { ProjectResourcesManager } from "@/components/ProjectResourcesManager";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getProject, listCourses } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { CourseSummary, ProjectDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  let project: ProjectDetail | undefined;
  let error;
  let courses: CourseSummary[] = [];
  let coursesError;
  try { project = await getProject(id, t.locale); }
  catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }
  if (project?.status === "active") {
    try { courses = await listCourses(t.locale); }
    catch { coursesError = t("Could not load course choices. Please retry."); }
  }
  return <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
    <Link href="/projects" className="text-accent underline">{t("All projects")}</Link>
    <PageHeader className="break-words [&>div]:min-w-0 [&_p]:whitespace-pre-wrap" title={project?.name ?? t("Project")} description={project?.goal} actions={project && <Badge>{t(project.status === "active" ? "Active" : "Archived")}</Badge>} />
    {error ? <ErrorState message={error} /> : project && <ProjectWorkspace key={project.id} project={project} courses={courses} coursesError={coursesError} />}
    {project && <ProjectResourcesManager projectId={project.id} isArchived={project.status === 'archived'} />}
    {project && <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-2 rounded-surface border border-line p-6">
        <h2 className="text-title">{t("Code review")}</h2>
        <p className="text-small text-ink-muted">{t("Upload code and logs from your own machine for static review.")}</p>
        <Link href={`/projects/${project.id}/submissions`} className="text-small text-accent underline">{t("Open code review")}</Link>
      </section>
      <section className="space-y-2 rounded-surface border border-line p-6">
        <h2 className="text-title">{t("Free exploration")}</h2>
        <p className="text-small text-ink-muted">{t("Ask questions against this project's own material.")}</p>
        <Link href={`/projects/${project.id}/explore`} className="text-small text-accent underline">{t("Open free exploration")}</Link>
      </section>
    </div>}
  </main>;
}
