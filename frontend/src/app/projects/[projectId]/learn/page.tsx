import { notFound } from "next/navigation";
import { CurriculumTree } from "@/components/CurriculumTree";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getProject, getProjectCurriculum } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { ProjectCurriculum, ProjectDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectLearningPage({ params }: { params: Promise<{ projectId: string }> }) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  let project: ProjectDetail | undefined;
  let data: ProjectCurriculum | undefined;
  let error: string | undefined;
  try { project = await getProject(id, t.locale); data = await getProjectCurriculum(id, t.locale); }
  catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server.");
  }
  return <div className="max-w-4xl space-y-8">
    <PageHeader title={t("Course knowledge tree")} />
    {error && <ErrorState message={error} />}
    {data && project && <CurriculumTree data={data} archived={project.status === "archived"} t={t} />}
  </div>;
}
