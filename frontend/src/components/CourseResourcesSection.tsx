"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import {
  addCourseTextResource,
  addCourseUrlResource,
  deleteCourseResource,
  listCourseResources,
  uploadCourseResource,
} from "@/lib/api";
import type { ResourceSummary } from "@/lib/types";

/**
 * The course's reference materials (资料), as a section of the course page.
 * Same shape as the quiz bank: a collapsed header with a count, expanding to
 * the list plus the add forms. The Q&A below grounds in these materials and
 * cites them the way project explore cites its uploads.
 */
export function CourseResourcesSection({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    listCourseResources(courseId)
      .then((data) => {
        setResources(data);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("Could not reach the server.")));
  }, [courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function afterChange(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not reach the server."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("Reference materials")} className="mt-6 rounded-surface bg-surface p-6 shadow-raise sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-subtitle font-semibold hover:text-accent"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          {t("Reference materials")}
          {loaded && (
            <span className="text-small font-normal text-ink-muted">
              {resources.length === 0
                ? t("Papers, notes and links the course Q&A can cite.")
                : t("{0} items", resources.length)}
            </span>
          )}
        </button>
      </div>
      {open && (
        <div className="mt-4">
          {error && (
            <p role="alert" className="mb-3 text-small text-danger">
              {error}
            </p>
          )}
          {resources.length === 0 ? (
            <p className="text-small text-ink-muted">{t("No reference materials yet.")}</p>
          ) : (
            <ul className="space-y-2">
              {resources.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium">{r.filename}</p>
                    <p className="text-micro text-ink-muted">
                      {r.kind} · {r.parse_status}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void afterChange(() => deleteCourseResource(courseId, r.id))}
                  >
                    {t("Remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            {!showAdd ? (
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
                {t("Add material")}
              </Button>
            ) : (
              <div className="space-y-4 rounded-control border border-line p-4">
                <div>
                  <p className="mb-2 text-small font-medium">{t("Upload a file")}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.md,.markdown,.txt"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void afterChange(async () => {
                        await uploadCourseResource(courseId, file);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      });
                    }}
                    className="text-small"
                  />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!textTitle.trim() || !textContent.trim()) return;
                    void afterChange(async () => {
                      await addCourseTextResource(courseId, textTitle.trim(), textContent);
                      setTextTitle("");
                      setTextContent("");
                    });
                  }}
                >
                  <p className="mb-2 text-small font-medium">{t("Paste text")}</p>
                  <input
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder={t("Title")}
                    disabled={busy}
                    className="mb-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
                  />
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder={t("Paste the material here")}
                    rows={4}
                    disabled={busy}
                    className="w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={busy} className="mt-2">
                    {t("Save")}
                  </Button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!url.trim()) return;
                    void afterChange(async () => {
                      await addCourseUrlResource(courseId, url.trim(), urlTitle.trim() || undefined);
                      setUrl("");
                      setUrlTitle("");
                    });
                  }}
                >
                  <p className="mb-2 text-small font-medium">{t("Add a link")}</p>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                    disabled={busy}
                    className="mb-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
                  />
                  <input
                    value={urlTitle}
                    onChange={(e) => setUrlTitle(e.target.value)}
                    placeholder={t("Title (optional)")}
                    disabled={busy}
                    className="mb-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
                  />
                  <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                    {t("Save")}
                  </Button>
                </form>
                <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>
                  {t("Done")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
