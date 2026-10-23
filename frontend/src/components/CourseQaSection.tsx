"use client";

import { useRef, useState } from "react";
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

  return (
    <section aria-label={t("Q&A")} className="rounded-surface bg-surface p-5 shadow-raise">
      {/*
        `!whitespace-normal` is load-bearing. antd's button sets white-space:
        nowrap, which is right for a one-word button and wrong for a heading that
        carries a sentence: in the course page's right-hand rail the description
        ran straight out of the card instead of wrapping.
      */}
      <Button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        type="text"
        block
        className="!whitespace-normal text-left"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, height: "auto", padding: "4px 8px", textAlign: "left" }}
      >
        <span className="min-w-0 flex-1">
          <span className="text-subtitle font-semibold">{t("Q&A")}</span>
          <span className="mt-1 block text-small font-normal text-ink-muted">
            {t("Ask anything about this course. Answers cite the lessons they come from.")}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-ink-muted">{open ? "▾" : "▸"}</span>
      </Button>
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
