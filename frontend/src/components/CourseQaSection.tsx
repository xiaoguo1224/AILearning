"use client";

import { useRef, useState } from "react";

import { ConceptTutor } from "@/components/ConceptTutor";
import { useI18n } from "@/components/LocaleProvider";

/**
 * Per-course Q&A, laid out as a section of the course page. The conversation is
 * keyed "course:{id}" so history, turn caps and grounding are scoped to this
 * course: multi-turn conversations keep their context, and answers cite the
 * lessons they draw on.
 */
export function CourseQaSection({
  courseId,
  courseTitle,
}: {
  courseId: number;
  courseTitle: string;
}) {
  const { t } = useI18n();
  const announceRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <section aria-label={t("Q&A")} className="rounded-surface bg-surface p-6 shadow-raise sm:p-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="text-subtitle font-semibold">{t("Q&A")}</span>
          <span className="mt-1 block text-small font-normal text-ink-muted">
            {t("Ask anything about this course. Answers cite the lessons they come from.")}
          </span>
        </span>
        <span aria-hidden className="text-ink-muted">{open ? "▾" : "▸"}</span>
      </button>
      <div ref={announceRef} aria-live="polite" className="sr-only" />
      {open && (
        <div className="mt-4">
          <ConceptTutor
            conceptKey={`course:${courseId}`}
            conceptLabel={courseTitle}
            open={true}
            onAnnounce={(message) => {
              if (announceRef.current) announceRef.current.textContent = message;
            }}
          />
        </div>
      )}
    </section>
  );
}
