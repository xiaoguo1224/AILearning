"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { ApiError, patchLesson } from "@/lib/api";

/**
 * Manual editing for a lesson's title, content and concepts. Opens a dialog
 * with the current values; saving PATCHes /api/lessons/{id} and refreshes.
 */
export function EditLessonButton({
  lessonId,
  initialTitle,
  initialContent,
  initialConcepts,
}: {
  lessonId: number;
  initialTitle: string;
  initialContent: string;
  initialConcepts: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [concepts, setConcepts] = useState(initialConcepts.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError(t("Title cannot be empty."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchLesson(lessonId, {
        title: title.trim(),
        content,
        concepts: concepts
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTitle(initialTitle);
          setContent(initialContent);
          setConcepts(initialConcepts.join(", "));
          setError(null);
          setOpen(true);
        }}
        className="rounded-control border border-line px-4 py-2 text-ui text-ink-muted transition-colors hover:text-ink"
      >
        {t("Edit")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Edit lesson")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-surface border border-line bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-subtitle font-semibold">{t("Edit lesson")}</h2>
            <label className="mt-4 block text-small font-medium">
              {t("Title")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui"
              />
            </label>
            <label className="mt-3 block text-small font-medium">
              {t("Concepts (comma-separated)")}
              <input
                value={concepts}
                onChange={(e) => setConcepts(e.target.value)}
                className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ui"
              />
            </label>
            <label className="mt-3 flex min-h-0 flex-1 flex-col text-small font-medium">
              {t("Content (markdown)")}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                className="mt-1 block w-full flex-1 rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-small"
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-small text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-control border border-line px-4 py-2 text-ui"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-control bg-accent px-4 py-2 text-ui font-medium text-white disabled:opacity-50"
              >
                {busy ? t("Saving…") : t("Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
