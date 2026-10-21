"use client";

import { useRef, useState } from "react";
import { Button } from "antd";

import { ConceptTutor } from "@/components/ConceptTutor";
import { useI18n } from "@/components/LocaleProvider";

/**
 * This lesson's Q&A, in the lesson page sidebar.
 *
 * The conversation is keyed "lesson:{id}" so history, turn caps and grounding
 * are scoped to this lesson: it answers about this lesson, citing it and the
 * course's reference materials. The transcript fetch waits for the first open,
 * so a lesson page does not pay for a conversation the learner never starts.
 */
export function LessonQaSection({
  lessonId,
  lessonTitle,
}: {
  lessonId: number;
  lessonTitle: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const announceRef = useRef<HTMLDivElement>(null);

  return (
    <section aria-label={t("Q&A")}>
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        type="text"
        size="small"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        {t("Q&A")}
      </Button>
      {!open && (
        <p className="mt-2 text-small text-ink-muted">
          {t("Ask about this lesson.")}
        </p>
      )}
      <div ref={announceRef} aria-live="polite" className="sr-only" />
      {open && (
        <div className="mt-3">
          <ConceptTutor
            conceptKey={`lesson:${lessonId}`}
            conceptLabel={lessonTitle}
            open={open}
            onAnnounce={(message) => {
              if (announceRef.current) announceRef.current.textContent = message;
            }}
          />
        </div>
      )}
    </section>
  );
}
