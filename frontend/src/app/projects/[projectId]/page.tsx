import { ProjectResourcesManager } from "@/components/ProjectResourcesManager";
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { ErrorState } from "@/components/ui/ErrorState";
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
  return <div className="max-w-5xl space-y-10">
    {error ? <ErrorState message={error} /> : project && <ProjectWorkspace key={project.id} project={project} courses={courses} coursesError={coursesError} />}
    {project && <section className="space-y-4">
      <h2 className="text-title">{t("Materials")}</h2>
      <ProjectResourcesManager projectId={project.id} isArchived={project.status === 'archived'} />
    </section>}
  </div>;
}
