"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError, archiveProject, createProject, linkProjectCourse, unlinkProjectCourse, updateProject } from "@/lib/api";
import type { CourseSummary, ProjectDetail, ProjectInput, ProjectMode } from "@/lib/types";

export function ProjectWorkspace({ project, courses = [], coursesError }: {
  project?: ProjectDetail; courses?: CourseSummary[]; coursesError?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<Record<keyof ProjectInput, { value: string; base: string }>>>({});
  const name = draft.name?.value ?? project?.name ?? "";
  const goal = draft.goal?.value ?? project?.goal ?? "";
  const mode = (draft.mode?.value ?? project?.mode ?? "course") as ProjectMode;
  const conflicts = project && Object.entries(draft).some(([key, edit]) =>
    edit.base !== project[key as keyof ProjectInput] && edit.value !== project[key as keyof ProjectInput]);
  function change(field: keyof ProjectInput, value: string) {
    setDraft(current => ({ ...current, [field]: { value, base: current[field]?.base ?? project?.[field] ?? (field === "mode" ? "course" : "") } }));
  }
  const [selected, setSelected] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = busy || refreshing;
  const archived = project?.status === "archived";
  const available = courses.filter(course => !project?.courses.some(link => link.course_id === course.id));

  async function act(operation: () => Promise<ProjectDetail>, success: string, clearDraft = false) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await operation();
      if (clearDraft) setDraft({});
      setNotice(success);
      setConfirmArchive(false);
      setSelected("");
      startTransition(() => {
        if (project) router.refresh();
        else router.push(`/projects/${saved.id}`);
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Is the backend running?");
      if (err instanceof ApiError && err.code === "project_changed") setNeedsReload(true);
      if (err instanceof ApiError && err.status === 409) startTransition(() => router.refresh());
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { name: name.trim(), goal: goal.trim(), mode };
    if (conflicts || needsReload) {
      setError("This project changed. Reload saved values before saving again.");
      return;
    }
    if (!project) { void act(() => createProject(body), "Project saved.", true); return; }
    const edits: Partial<ProjectInput> = {};
    if (draft.name && body.name !== project.name) edits.name = body.name;
    if (draft.goal && body.goal !== project.goal) edits.goal = body.goal;
    if (draft.mode && body.mode !== project.mode) edits.mode = project.mode;
    if (Object.keys(edits).length === 0) { setNotice("No changes to save."); return; }
    void act(() => updateProject(project.id, { ...edits, expected_updated_at: project.updated_at }), "Project saved.", true);
  }

  const inputCls = "mt-2 w-full border-0 border-b border-line bg-transparent px-0 py-2 text-ui text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-0 disabled:opacity-60";

  return (
    <div className="mx-auto max-w-3xl">
      {error && <ErrorState message={t(error)} />}
      {notice && <p role="status" className="mb-6 text-small text-success">{t(notice)}</p>}
      {!archived && (conflicts || needsReload) && (
        <div className="mb-6 border-l-2 border-warning-border pl-4">
          <p className="text-small">{t("Your draft is preserved. Reloading saved values discards these edits.")}</p>
          <Button variant="secondary" disabled={pending} onClick={() => { setDraft({}); setError(null); setNeedsReload(false); }} className="mt-2">
            {t("Discard draft and reload saved values")}
          </Button>
        </div>
      )}

      {/* Project settings — clean form, no box */}
      <section className="pb-10">
        <h2 className="text-lg font-medium tracking-tight">{t("Project settings")}</h2>
        <div className="mt-6">
          {archived ? (
            <p className="text-ink-muted">{t("This project is archived. Courses and learning history are preserved.")}</p>
          ) : (
            <form onSubmit={save} className="space-y-6" aria-label={t(project ? "Edit project" : "Create project")}>
              <div>
                <label className="text-small font-medium text-ink-muted" htmlFor="project-name">{t("Project name")}</label>
                <input id="project-name" value={name} onChange={e => change("name", e.target.value)} required maxLength={200} disabled={pending} className={inputCls} placeholder={t("Give your project a name")} />
              </div>
              <div>
                <label className="text-small font-medium text-ink-muted" htmlFor="project-goal">{t("Learning goal")}</label>
                <textarea id="project-goal" value={goal} onChange={e => change("goal", e.target.value)} maxLength={5000} rows={3} disabled={pending} className={inputCls + " resize-none"} placeholder={t("What do you want to achieve?")} />
              </div>
              <div>
                <label className="text-small font-medium text-ink-muted" htmlFor="project-mode">{t("Initial template")}</label>
                <select id="project-mode" value={mode} onChange={e => change("mode", e.target.value)} disabled={pending} className={inputCls}>
                  <option value="course">{t("Course study")}</option>
                  <option value="research">{t("Research reading")}</option>
                  <option value="practice">{t("Programming practice")}</option>
                </select>
              </div>
              <div className="pt-2">
                <Button type="submit" disabled={pending}>{t(pending ? "Saving…" : project ? "Save project" : "Create project")}</Button>
              </div>
            </form>
          )}
        </div>
      </section>

      {project && (
        <>
          {/* Linked courses — refined list with dividers */}
          <section aria-label={t("Linked courses")} className="border-t border-line py-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium tracking-tight">{t("Linked courses")}</h2>
              <span className="text-small text-ink-faint">{project.courses.length}</span>
            </div>
            <p className="mt-1 text-small text-ink-muted">{t("Courses can be shared between projects. Unlinking keeps lessons and learning history.")}</p>
            <div className="mt-6">
              {project.courses.length === 0 ? (
                <p className="text-small text-ink-faint">{t("No linked courses yet.")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {project.courses.map(course => (
                    <li key={course.course_id} className="group flex items-center justify-between gap-4 py-3">
                      <Link href={`/courses/${course.course_id}`} className="min-w-0 flex-1 truncate text-ui text-ink transition-colors hover:text-accent">
                        {course.title}
                      </Link>
                      {!archived && (
                        <button disabled={pending} onClick={() => void act(() => unlinkProjectCourse(project.id, course.course_id), "Course unlinked.")} className="shrink-0 text-small text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:opacity-50">
                          {t("Unlink")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!archived && (
                <div className="mt-6 flex items-center gap-3">
                  {coursesError ? (
                    <ErrorState message={coursesError} action={<Button variant="secondary" onClick={() => router.refresh()}>{t("Retry")}</Button>} />
                  ) : available.length > 0 ? (
                    <>
                      <select value={selected} onChange={e => setSelected(e.target.value)} disabled={pending} className="flex-1 border-0 border-b border-line bg-transparent px-0 py-2 text-small text-ink focus:border-accent focus:outline-none" aria-label={t("Choose a course")}>
                        <option value="">{t("Choose a course")}</option>
                        {available.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
                      </select>
                      <Button disabled={pending || !selected} onClick={() => void act(() => linkProjectCourse(project.id, Number(selected), project.courses.length), "Course linked.")} variant="secondary">
                        {t("Link")}
                      </Button>
                    </>
                  ) : (
                    <p className="text-small text-ink-faint">{t("No other courses available.")}</p>
                  )}
                </div>
              )}
              {!archived && (
                <Link href="/courses/new" className="mt-4 inline-block text-small text-accent hover:underline">{t("Create a course")} →</Link>
              )}
            </div>
          </section>

          {/* Danger zone — subtle */}
          {!archived && (
            <section aria-label={t("Danger zone")} className="border-t border-line py-10">
              {confirmArchive ? (
                <div role="group" aria-label={t("Confirm archive")} className="space-y-4">
                  <p className="text-small text-ink-muted">{t("Archive “{0}”? Courses and learning history will be kept. The project becomes read-only.", project.name)}</p>
                  <div className="flex gap-3">
                    <Button variant="danger" disabled={pending} onClick={() => void act(() => archiveProject(project.id), "Project archived.")}>{t("Confirm archive")}</Button>
                    <Button variant="secondary" disabled={pending} onClick={() => setConfirmArchive(false)}>{t("Cancel")}</Button>
                  </div>
                </div>
              ) : (
                <button disabled={pending} onClick={() => setConfirmArchive(true)} className="text-small text-ink-faint transition-colors hover:text-danger disabled:opacity-50">
                  {t("Archive project")}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
