"use client";

import { useId, useRef, useState } from "react";
import { Button } from "antd";

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
  const panelId = useId();

  return (
    <section aria-label={t("Q&A")} className="min-w-0 rounded-3xl border border-line bg-surface p-5 shadow-raise">
      {/*
        `!whitespace-normal` is load-bearing. antd's button sets white-space:
        nowrap, which is right for a one-word button and wrong for a heading that
        carries a sentence: in the course page's right-hand rail the description
        ran straight out of the card instead of wrapping.
      */}
      <Button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        type="text"
        block
        className="!whitespace-normal text-left"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, height: "auto", padding: 0, textAlign: "left", color: "var(--sf-ink)" }}
      >
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" />
            <path d="M8 9h6M8 13h4" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-subtitle font-semibold">{t("Q&A")}</span>
          <span className="mt-1.5 block text-small font-normal leading-relaxed text-ink-muted">
            {t("Ask anything about this course. Answers cite the lessons they come from.")}
          </span>
        </span>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          className={`mt-2 shrink-0 text-ink-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      <div ref={announceRef} aria-live="polite" className="sr-only" />
      {open && (
        <div id={panelId}>
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
