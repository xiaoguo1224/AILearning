"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError, archiveProject, createProject, linkProjectCourse, unlinkProjectCourse, updateProject } from "@/lib/api";
import type { CourseSummary, ProjectDetail, ProjectMode } from "@/lib/types";

const INPUT = "mt-1 w-full rounded-control border border-line bg-transparent px-3 py-2 text-ui text-ink disabled:opacity-60";

export function ProjectWorkspace({ project, courses = [], coursesError }: {
  project?: ProjectDetail; courses?: CourseSummary[]; coursesError?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const [mode, setMode] = useState<ProjectMode>(project?.mode ?? "course");
  const [selected, setSelected] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = busy || refreshing;
  const archived = project?.status === "archived";
  const available = courses.filter(course => !project?.courses.some(link => link.course_id === course.id));

  async function act(operation: () => Promise<ProjectDetail>, success: string) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await operation();
      setNotice(success);
      setConfirmArchive(false);
      setSelected("");
      startTransition(() => {
        if (project) router.refresh();
        else router.push(`/projects/${saved.id}`);
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
      if (err instanceof ApiError && err.status === 409) startTransition(() => router.refresh());
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { name: name.trim(), goal: goal.trim(), mode };
    void act(() => project ? updateProject(project.id, body) : createProject(body), "Project saved.");
  }

  return <div className="space-y-8">
    {error && <ErrorState message={t(error)} />}
    {notice && <p role="status" className="text-small text-success">{t(notice)}</p>}
    {archived ? <p className="rounded-surface border border-line p-4 text-ink-muted">{t("This project is archived. Courses and learning history are preserved.")}</p> :
      <form onSubmit={save} className="space-y-4" aria-label={t(project ? "Edit project" : "Create project")}>
        <Field id="project-name" label={t("Project name")} value={name} onChange={e => setName(e.target.value)} required maxLength={200} disabled={pending} />
        <label className="block text-small text-ink-muted" htmlFor="project-goal">{t("Learning goal")}
          <textarea id="project-goal" value={goal} onChange={e => setGoal(e.target.value)} maxLength={5000} rows={3} disabled={pending} className={INPUT} />
        </label>
        <label className="block text-small text-ink-muted" htmlFor="project-mode">{t("Initial template")}
          <select id="project-mode" value={mode} onChange={e => setMode(e.target.value as ProjectMode)} disabled={pending} className={INPUT}>
            <option value="course">{t("Course study")}</option><option value="research">{t("Research reading")}</option><option value="practice">{t("Programming practice")}</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>{t(pending ? "Saving…" : project ? "Save project" : "Create project")}</Button>
      </form>}
    {project && <section aria-label={t("Linked courses")} className="space-y-4">
      <h2 className="text-title">{t("Linked courses")}</h2>
      <p className="text-small text-ink-muted">{t("Courses can be shared between projects. Unlinking keeps lessons and learning history.")}</p>
      {project.courses.length === 0 ? <p>{t("No linked courses yet.")}</p> : <ul className="space-y-3">{project.courses.map(course =>
        <li key={course.course_id} className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line p-4">
          <Link href={`/courses/${course.course_id}`} className="min-w-0 break-words font-medium text-accent underline underline-offset-2">{course.title}</Link>
          {!archived && <Button disabled={pending} variant="ghost" onClick={() => void act(() => unlinkProjectCourse(project.id, course.course_id), "Course unlinked.")}>{t("Unlink course")}</Button>}
        </li>)}</ul>}
      {!archived && <>
        {coursesError ? <ErrorState message={coursesError} action={<Button variant="secondary" onClick={() => router.refresh()}>{t("Retry")}</Button>} /> : available.length > 0 ?
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-small text-ink-muted" htmlFor="project-course">{t("Choose a course")}
              <select id="project-course" value={selected} onChange={e => setSelected(e.target.value)} disabled={pending} className={INPUT}>
                <option value="">{t("Choose a course")}</option>{available.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </label>
            <Button disabled={pending || !selected} onClick={() => void act(() => linkProjectCourse(project.id, Number(selected), project.courses.length), "Course linked.")}>{t("Link course")}</Button>
          </div> : <p className="text-small text-ink-muted">{t("No other courses available.")}</p>}
        <Link href="/courses/new" className="text-accent underline underline-offset-2">{t("Create a course")}</Link>
      </>}
    </section>}
    {project && !archived && <section className="border-t border-line pt-6">
      {confirmArchive ? <div role="group" aria-label={t("Confirm archive")} className="space-y-3">
        <p>{t("Archive “{0}”? Courses and learning history will be kept. The project becomes read-only.", project.name)}</p>
        <div className="flex gap-3"><Button variant="danger" disabled={pending} onClick={() => void act(() => archiveProject(project.id), "Project archived.")}>{t("Confirm archive")}</Button><Button variant="secondary" disabled={pending} onClick={() => setConfirmArchive(false)}>{t("Cancel")}</Button></div>
      </div> : <Button variant="secondary" disabled={pending} onClick={() => setConfirmArchive(true)}>{t("Archive project")}</Button>}
    </section>}
  </div>;
}
