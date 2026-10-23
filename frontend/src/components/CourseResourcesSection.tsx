"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Button as AntButton } from "antd";
import { ResourceAddDialog } from "@/components/ResourceAddDialog";
import { deleteCourseResource, listCourseResources } from "@/lib/api";
import type { ResourceSummary } from "@/lib/types";

/**
 * The course's reference materials (资料), as a section of the course page.
 * Same shape as the quiz bank: a collapsed header with a count, expanding to
 * the list. Adding a material opens a dialog — the three ways to add one used
 * to be stacked under the list, which turned a short list into a form page.
 * The Q&A below grounds in these materials and cites them the way project
 * explore cites its uploads.
 */
export function CourseResourcesSection({ courseId }: { courseId: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

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
    <section aria-label={t("Reference materials")} className="rounded-surface bg-surface p-5 shadow-raise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* `!whitespace-normal`: antd buttons are nowrap, and this one carries a
            sentence — in the course page's left-hand rail it overflowed the card. */}
        <AntButton
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          type="text"
          className="!whitespace-normal text-left"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          {t("Reference materials")}
          {loaded && (
            <span className="block text-small font-normal text-ink-muted">
              {resources.length === 0
                ? t("Papers, notes and links the course Q&A can cite.")
                : t("{0} items", resources.length)}
            </span>
          )}
        </AntButton>
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
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              {t("Add material")}
            </Button>
          </div>
        </div>
      )}
      {adding && (
        <ResourceAddDialog
          courseId={courseId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </section>
  );
}
