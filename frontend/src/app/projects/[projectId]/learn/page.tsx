import Link from "next/link";
import { notFound } from "next/navigation";

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
    <PageHeader title={t("Courses")} />
    {error && <ErrorState message={error} />}
    {data && <ProjectCourseList courses={data.courses} t={t} />}
  </div>;
}

function ProjectCourseList({
  courses,
  t,
}: {
  courses: { id: number; title: string }[];
  t: any;
}) {
  if (courses.length === 0) {
    return <p>{t("No courses in this project yet.")}</p>;
  }
  return (
    <ul className="space-y-2">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={`/courses/${course.id}`}
            className="block rounded-surface border border-line p-4 hover:border-line-strong"
          >
            <span className="text-ui font-medium">{course.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
