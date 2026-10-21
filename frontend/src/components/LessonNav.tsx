"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCourse } from "@/lib/api";

interface LessonNavProps {
  courseId: number;
  lessonId: number;
}

/**
 * Previous / Next chapter navigation for a lesson page.
 */
export function LessonNav({ courseId, lessonId }: LessonNavProps) {
  const [prev, setPrev] = useState<{ id: number; title: string } | null>(null);
  const [next, setNext] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCourse(courseId)
      .then((course) => {
        if (cancelled) return;
        const lessons: { id: number; title: string }[] = [];
        for (const m of course.modules) {
          for (const l of m.lessons) {
            lessons.push({ id: l.id, title: l.title });
          }
        }
        const idx = lessons.findIndex((l) => l.id === lessonId);
        if (idx >= 0) {
          setPrev(idx > 0 ? lessons[idx - 1] : null);
          setNext(idx < lessons.length - 1 ? lessons[idx + 1] : null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId]);

  if (!prev && !next) return null;

  return (
    <nav
      aria-label="章节导航"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        marginTop: 48,
        paddingTop: 24,
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ flex: 1 }}>
        {prev && (
          <Link
            href={`/courses/${courseId}/lessons/${prev.id}`}
            style={{ color: "var(--ink-muted)", fontSize: 14 }}
          >
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
              ← 上一章节
            </span>
            <span style={{ fontWeight: 500 }}>{prev.title}</span>
          </Link>
        )}
      </div>
      <div style={{ flex: 1, textAlign: "right" }}>
        {next && (
          <Link
            href={`/courses/${courseId}/lessons/${next.id}`}
            style={{ color: "var(--ink-muted)", fontSize: 14 }}
          >
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>
              下一章节 →
            </span>
            <span style={{ fontWeight: 500 }}>{next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
