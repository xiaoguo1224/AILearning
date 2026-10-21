import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectReviewTasks } from "@/components/ProjectReviewTasks";
import { ReviewSession } from "@/components/ReviewSession";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getProject, getProjectPractice, listProjectReviewTasks } from "@/lib/api";
import { getTranslator } from "@/lib/locale-server";
import type { ProjectDetail, ProjectReviewTasks as Tasks, ReviewQueue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>; searchParams: Promise<{ concept?: string }>;
}) {
  const t = await getTranslator();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!/^\d+$/.test(projectId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  const { concept } = await searchParams;
  let project: ProjectDetail | undefined;
  let queue: ReviewQueue | undefined;
  let tasks: Tasks | undefined;
  let error: string | undefined;
  try {
    project = await getProject(id, t.locale);
    if (concept && project.status === "active") {
      queue = await getProjectPractice(id, concept, t.locale);
    } else {
      tasks = await listProjectReviewTasks(id, t.locale);
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && !concept) notFound();
    error = err instanceof ApiError ? err.message : t("Could not reach the server.");
  }
  if (queue) return <ReviewSession key={concept} queue={queue} returnHref={`/projects/${id}/review-tasks`} />;
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-12">
    <Link href={`/projects/${id}`} className="text-accent underline">{project?.name ?? t("Project")}</Link>
    <PageHeader title={t("Mistakes and review")} />
    {error && <ErrorState message={error} />}
    {concept && error && <Link href={`/projects/${id}/review-tasks`}>{t("Back to review suggestions")}</Link>}
    {tasks && project && <ProjectReviewTasks projectId={id} tasks={tasks} archived={project.status === "archived"} />}
  </main>;
}
