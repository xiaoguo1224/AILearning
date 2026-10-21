"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { RegenDraftPreview } from "@/components/RegenDraftPreview";
import {
  ApiError,
  patchLesson,
  streamLessonRegeneration,
  type LessonDraft,
} from "@/lib/api";

/**
 * "Regenerate this lesson" on the lesson page.
 *
 * The draft streams back over SSE (regen_started → regen_draft → regen_done),
 * so the learner sees progress instead of a hung button: the dialog stays open
 * with a "rewriting" state until the draft lands. The draft previews editable,
 * and 采用 / 不采用 decides. Nothing is saved until 采用.
 */
export function RegenerateLessonButton({ lessonId }: { lessonId: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [phase, setPhase] = useState<"idle" | "generating" | "draft">("idle");
  const [draft, setDraft] = useState<LessonDraft | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function start() {
    setError(null);
    setDraft(null);
    setPhase("generating");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const stream = streamLessonRegeneration(lessonId, feedback, {
        signal: controller.signal,
      });
      for await (const event of stream) {
        if (event.type === "regen_draft") {
          setDraft(event.draft);
          setPhase("draft");
        } else if (event.type === "error") {
          setError(event.message || event.error);
          setPhase("idle");
        }
        // regen_started: the dialog already shows "rewriting"; regen_done: nothing to do.
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setPhase("idle");
      }
      // AbortError: the learner closed the dialog; stay quiet.
    } finally {
      abortRef.current = null;
    }
  }

  function close() {
    abortRef.current?.abort();
    setDialogOpen(false);
    setPhase("idle");
    setDraft(null);
    setError(null);
  }

  async function adopt(edited: LessonDraft) {
    setAdopting(true);
    setError(null);
    try {
      await patchLesson(lessonId, {
        title: edited.title,
        content: edited.content,
        concepts: edited.concepts,
      });
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setAdopting(false);
    }
  }

  const generating = phase === "generating";

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setFeedback("");
          setError(null);
          setDialogOpen(true);
        }}
      >
        {t("Regenerate")}
      </Button>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("Regenerate lesson")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !generating && !adopting && close()}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-surface bg-surface p-6 shadow-raise"
            onClick={(e) => e.stopPropagation()}
          >
            {phase === "idle" && (
              <>
                <h2 className="text-subtitle font-semibold">{t("Regenerate lesson")}</h2>
                <p className="mt-1 text-small text-ink-muted">
                  {t("The AI rewrites this lesson from its own content. Nothing is saved until you adopt the draft.")}
                </p>
                {error && (
                  <p role="alert" className="mt-3 text-small text-danger">
                    {error}
                  </p>
                )}
                <label className="mt-4 block text-small font-medium">
                  {t("What should change? (optional)")}
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder={t("e.g. too hard, add more examples")}
                    className="mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={close}>
                    {t("Cancel")}
                  </Button>
                  <Button size="sm" onClick={() => void start()}>
                    {t("Generate")}
                  </Button>
                </div>
              </>
            )}

            {phase === "generating" && (
              <div className="py-8 text-center">
                <div
                  aria-hidden
                  className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"
                />
                <h2 className="mt-4 text-subtitle font-semibold">{t("Rewriting the lesson…")}</h2>
                <p className="mt-1 text-small text-ink-muted">
                  {t("The AI is rewriting this lesson from its own content. This can take a minute.")}
                </p>
                <div className="mt-5">
                  <Button variant="secondary" size="sm" onClick={close}>
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            )}

            {phase === "draft" && draft && (
              <>
                <h2 className="text-subtitle font-semibold">{t("Review the new draft")}</h2>
                <p className="mt-1 text-small text-ink-muted">
                  {t("Edit it first if you like, then adopt or discard.")}
                </p>
                {error && (
                  <p role="alert" className="mt-3 text-small text-danger">
                    {error}
                  </p>
                )}
                <div className="mt-4">
                  <RegenDraftPreview
                    draft={draft}
                    adopting={adopting}
                    onAdopt={(edited) => void adopt(edited)}
                    onDiscard={close}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
