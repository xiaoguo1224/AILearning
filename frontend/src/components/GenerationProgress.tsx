"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Button as AntButton } from "antd";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import {
  ApiError,
  SourceGenerationError,
  streamCourseGeneration,
} from "@/lib/api";
import type {
  GenerationStreamEvent,
  StreamLesson,
  StreamOutlineModule,
} from "@/lib/api";
import type { SourceFailure, SourceInput } from "@/lib/types";
import { formatUsd } from "@/lib/format";

type LessonSlot = {
  title: string;
  status: "pending" | "done" | "failed";
  lesson: StreamLesson | null;
};

type ModuleState = {
  title: string;
  lessons: LessonSlot[];
};

type DoneInfo = {
  id: number;
  title: string;
  usage: { run_cost_usd: number; total_cost_usd: number; alert_active: boolean };
};

function planToState(modules: StreamOutlineModule[]): ModuleState[] {
  return modules.map((m) => ({
    title: m.title,
    lessons: m.lessons.map((l) => ({ title: l.title, status: "pending" as const, lesson: null })),
  }));
}

/**
 * Progressive course generation view. The outline event draws every lesson's
 * slot up front; each lesson event then fills its slot in place, so the learner
 * watches the course assemble instead of staring at a spinner. Lessons are
 * authored in parallel server-side and can arrive out of order — each carries
 * its module/lesson index, which is the only thing positioning uses.
 */
export function GenerationProgress({
  sources,
  openStream,
  onSourceFailures,
  onCancel,
}: {
  sources: SourceInput[];
  /**
   * Override the stream source. The default streams /courses/generate/stream
   * from `sources`; the regenerate flow passes a factory that streams
   * /api/courses/{id}/regenerate/stream instead, so this same progress UI
   * renders both without a second component to drift.
   */
  openStream?: (signal: AbortSignal) => AsyncGenerator<GenerationStreamEvent>;
  onSourceFailures: (failures: SourceFailure[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    async function run() {
      try {
        const open = openStream ?? ((signal) => streamCourseGeneration(sources, { signal }));
        for await (const event of open(controller.signal)) {
          if (cancelled) return;
          applyEvent(event);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        if (err instanceof SourceGenerationError) {
          onSourceFailures(err.sources);
          onCancel();
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : t("Could not reach the server. Is the backend running?"),
        );
      }
    }

    function applyEvent(event: GenerationStreamEvent) {
      switch (event.type) {
        case "outline":
          setTitle(event.title);
          setModules(planToState(event.modules));
          break;
        case "lesson":
          setModules((prev) =>
            prev.map((m, mi) =>
              mi !== event.module_index
                ? m
                : {
                    ...m,
                    lessons: m.lessons.map((l, li) =>
                      li !== event.lesson_index
                        ? l
                        : { ...l, status: "done" as const, lesson: event.lesson },
                    ),
                  },
            ),
          );
          break;
        case "lesson_failed":
          setFailed((n) => n + 1);
          setModules((prev) =>
            prev.map((m, mi) =>
              mi !== event.module_index
                ? m
                : {
                    ...m,
                    lessons: m.lessons.map((l, li) =>
                      li !== event.lesson_index ? l : { ...l, status: "failed" as const },
                    ),
                  },
            ),
          );
          break;
        case "done":
          setDone({ id: event.id, title: event.title, usage: event.usage });
          break;
        case "error":
          setError(event.message || t("Generation failed."));
          break;
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Sources are fixed for the life of this view; re-running on identity
    // change would restart the generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = modules.reduce((n, m) => n + m.lessons.length, 0);
  const finished = modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.status !== "pending").length,
    0,
  );
  const pct = total === 0 ? 0 : Math.round((finished / total) * 100);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-display text-xl font-bold">{title}</h2>
            ) : (
              <div className="h-7 w-64 animate-pulse rounded bg-surface-sunken" aria-hidden />
            )}
            <p className="mt-1 text-sm text-ink-muted">
              {error
                ? t("Generation stopped.")
                : done
                  ? t("Course ready.")
                  : total === 0
                    ? t("Planning the course outline…")
                    : t("{0} of {1} lessons ready", finished, total)}
              {failed > 0 && !done && t(" ({0} failed, the rest continues)", failed)}
            </p>
          </div>
          {!done && !error && (
            <Button type="button" variant="tinted" onClick={() => { abortRef.current?.abort(); onCancel(); }}>
              {t("Cancel")}
            </Button>
          )}
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-fill transition-[width] duration-500 ease-standard"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      {error && (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      )}

      {modules.map((module, mi) => (
        <section key={`${mi}-${module.title}`} aria-label={module.title}>
          <h3 className="mb-2 text-sm font-semibold text-ink-muted">{module.title}</h3>
          <div className="flex flex-col gap-2">
            {module.lessons.map((slot, li) => {
              const key = `${mi}:${li}`;
              const isOpen = expanded.has(key);
              return (
                <Card key={key} className={slot.status === "failed" ? "opacity-70" : undefined}>
                  <AntButton
                    onClick={() => slot.lesson && toggle(key)}
                    type="text"
                    block
                    aria-expanded={slot.lesson ? isOpen : undefined}
                    disabled={!slot.lesson}
                    style={{ display: "flex", alignItems: "center", gap: 12, height: "auto", padding: "8px 12px", textAlign: "left" }}
                  >
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {slot.status === "done" ? (
                        <span className="text-base text-fill">✓</span>
                      ) : slot.status === "failed" ? (
                        <span className="text-base text-danger">!</span>
                      ) : (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fill" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{slot.title}</span>
                      {slot.status === "pending" && (
                        <span className="text-xs text-ink-muted">{t("Generating…")}</span>
                      )}
                      {slot.status === "failed" && (
                        <span className="text-xs text-danger">{t("Could not generate; the rest of the course continues.")}</span>
                      )}
                      {slot.lesson && (
                        <span className="text-xs text-ink-muted">
                          {t("{0} practice questions", slot.lesson.quiz.length)}
                          {slot.lesson.concepts.length > 0 &&
                            ` · ${slot.lesson.concepts.slice(0, 3).join(" · ")}`}
                        </span>
                      )}
                    </span>
                    {slot.lesson && (
                      <span className="text-xs text-ink-muted" aria-hidden>
                        {isOpen ? "▴" : "▾"}
                      </span>
                    )}
                  </AntButton>
                  {slot.lesson && isOpen && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="whitespace-pre-line text-sm text-ink-muted">
                        {slot.lesson.content.slice(0, 600)}
                        {slot.lesson.content.length > 600 ? "…" : ""}
                      </p>
                      {slot.lesson.quiz.length > 0 && (
                        <ol className="mt-3 flex flex-col gap-2">
                          {slot.lesson.quiz.map((q, qi) => (
                            <li key={qi} className="rounded-control bg-surface-sunken px-3 py-2 text-sm">
                              <span className="font-medium">{qi + 1}. </span>
                              {q.question}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {done && (
        <Callout tone="success" role="status">
          <p className="font-medium">{t("Course generated: ")}{done.title}</p>
          <p className="mt-1">
            {t("This run cost an estimated ")}{formatUsd(done.usage.run_cost_usd)}{t(". Total API spend so far: ")}{formatUsd(done.usage.total_cost_usd)}
            {done.usage.alert_active && t(", which has crossed the cost alert threshold")}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => router.push(`/courses/${done.id}`)}>
              {t("Open course")}
            </Button>
          </div>
        </Callout>
      )}
    </div>
  );
}
