"use client";

import { AnswerHistory } from "@/components/AnswerHistory";

import Link from "next/link";





import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useRef, useState } from "react";
import { Pagination } from "antd";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ApiError,
  getJob,
  listJobs,
  startAnswerAnalysisJob,
  startGradeJob,
  startHintJob,
  startQuestionSolutionJob,
} from "@/lib/api";
import type { Job } from "@/lib/api";
import type { UploadedAttachment } from "@/lib/api";
import { AttachmentInput } from "@/components/AttachmentInput";
import type { QuizHint } from "@/lib/api";
import { QuizMarkdown } from "@/components/QuizMarkdown";
import type { AttemptState, QuizItem, QuizProgress } from "@/lib/types";

interface JobResult {
  correct: boolean;
  expected: string;
  feedback?: string;
  attempt_state: AttemptState;
  hint?: QuizHint;
  /** Set by the solution job: the question explained, no answer involved. */
  solution?: string;
  /** Set by the answer-analysis job: a review of one submitted answer. */
  analysis?: string;
}

interface Feedback {
  correct: boolean;
  expected: string;
  /** The AI's verdict reason; only set for code-kind answers. */
  aiFeedback: string | null;
}

/**
 * "validation" is the empty-answer guard in `submit`, entirely a client-side complaint
 * about the CURRENT `answer`, so it goes stale the instant the learner edits that answer
 * and is cleared on the next `onChange`. "server" is `answerQuiz` failing (network down,
 * `ApiError`), a fact about the last REQUEST, not about what is currently typed; editing
 * the field doesn't undo that the previous attempt never reached the server, so it is
 * left in place until the next submit (successful or not) decides its fate. Kept as a
 * separate field rather than inferred from the message text so clearing logic never has
 * to pattern-match app copy.
 */
type ErrorKind = "validation" | "server";

interface ItemState {
  answer: string;
  /** Files attached to this answer. Kept after submitting: they are part of the record. */
  attachments: UploadedAttachment[];
  feedback: Feedback | null;
  /** Progressive hints fetched for a wrong code answer, in level order. */
  hints: QuizHint[];
  hintLoading: boolean;
  /**
   * The question explained on its own terms. Loaded on demand and kept until the
   * panel closes; it never depends on what the learner wrote, so it survives a retry.
   */
  solution: string | null;
  solutionOpen: boolean;
  solutionLoading: boolean;
  /**
   * A review of one submitted answer — a different question from `solution` above.
   * Cleared on the next submit: a critique of the previous answer shown beside the
   * new one reads as a critique of the new one.
   */
  analysis: string | null;
  analysisOpen: boolean;
  analysisLoading: boolean;
  attemptState: AttemptState;
  submitting: boolean;
  error: string | null;
  errorKind: ErrorKind | null;
  /**
   * Bumped every time `error` is set, and used as the error paragraph's `key`. `error`
   * can be set to the SAME literal twice in a row (two empty submits with no edit
   * between them), which leaves the string child unchanged, so React neither unmounts
   * nor patches the text node, and `role="alert"` has nothing to re-announce. Changing
   * the key forces the old node out and a fresh one in on every set, identical text or
   * not, so the second submit gets its own node to announce from.
   */
  errorNonce: number;
}

/**
 * Where focus goes once a submission that disabled controls finishes and they are
 * re-enabled or gone: back to the answer control for an item still open to a retry,
 * or to the "Correct" message once that is the only thing solving the item left behind.
 */
type PendingFocus = "answer" | "correct";

/** The item as the server last saw it, so a reload redraws the learner's last attempt. */
function restored(item: QuizItem): ItemState {
  const latest = item.attempt_state.latest_quiz_attempt;
  return {
    answer: latest?.answer ?? "",
    // The files come back with the attempt. Without them a learner who answered with
    // a photographed page reopened the question to an empty box and no way to see
    // what they had actually submitted.
    attachments: (latest?.attachments ?? []).map((row) => ({
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      kind: row.kind,
    })),
    feedback:
      latest === null
        ? null
        : { correct: latest.correct, expected: latest.expected, aiFeedback: null },
    hints: [],
    hintLoading: false,
    solution: null,
    solutionOpen: false,
    solutionLoading: false,
    analysis: null,
    analysisOpen: false,
    analysisLoading: false,
    attemptState: item.attempt_state,
    submitting: false,
    error: null,
    errorKind: null,
    errorNonce: 0,
  };
}

/** Record when an item became answerable, for the elapsed_ms timing signal. */
function markShown(shownAt: Map<number, number>, itemId: number, restart = false): void {
  if (restart || !shownAt.has(itemId)) shownAt.set(itemId, Date.now());
}

export function QuizSection({
  quiz,
  progress,
  renderItemAction,
  courseId,
  returnHref,
}: {
  quiz: QuizItem[];
  progress: QuizProgress;
  /** Extra control per question, e.g. the course bank's variant button. */
  renderItemAction?: (item: QuizItem) => React.ReactNode;
  /** When set, code questions link to their detail page instead of answering inline. */
  courseId?: number;
  /** Page containing this list, for returning from a code question. */
  returnHref?: string;
}) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const totalPages = Math.ceil(quiz.length / PAGE_SIZE);
  const pagedQuiz = quiz.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<number, ItemState>>({});
  /** When each item became answerable, for the elapsed_ms timing signal. */
  const shownAt = useRef<Map<number, number>>(new Map());

  /**
   * Per-item refs to the controls a submission's focus restoration might land on.
   * The radios and the answer box are never unmounted (their options and their kind
   * are fixed once a lesson loads), so a plain ref per item is enough for either;
   * `mcqRefs` is keyed a second time by option because a submission's target is
   * whichever radio is CURRENTLY checked, not a fixed one. `correctRefs` is the
   * "Correct" message, the only thing left to land on once solving an item unmounts
   * its button and leaves its inputs disabled. `inputRefs` holds either an `<input>`
   * (fill) or a `<textarea>` (short, inside AttachmentInput), hence the base type.
   */
  const inputRefs = useRef<Map<number, HTMLElement>>(new Map());
  const codeRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const mcqRefs = useRef<Map<number, Map<string, HTMLInputElement>>>(new Map());
  const correctRefs = useRef<Map<number, HTMLParagraphElement>>(new Map());
  /**
   * Set right before `submit` starts disabling controls, consumed by the effect below
   * once the response it belongs to has rendered. A later commit for the same item
   * (an error message from the empty-answer guard, say) finds nothing armed and does
   * not touch focus, because the guard below only ever runs for a commit it set.
   */
  const pendingFocus = useRef<Map<number, PendingFocus>>(new Map());

  const stateOf = (item: QuizItem) => answers[item.id] ?? restored(item);
  /**
   * `update` may be a plain object or a function of the item's PRIOR state. The function
   * form exists for `errorNonce`, which has to increment off whatever the last render
   * actually stored, not off the `state` a caller closed over: `submit`'s catch branch
   * runs after an `await`, and a caller reading a nonce it captured before that await
   * would double-write the same next value if two submits for the same item ever raced.
   */
  const patch = (
    item: QuizItem,
    update: Partial<ItemState> | ((prev: ItemState) => Partial<ItemState>),
  ) =>
    setAnswers((prev) => {
      const base = prev[item.id] ?? restored(item);
      const next = typeof update === "function" ? update(base) : update;
      return { ...prev, [item.id]: { ...base, ...next } };
    });

  useEffect(() => {
    for (const item of quiz) markShown(shownAt.current, item.id);
  }, [quiz]);

  /**
   * Re-attach to whatever is still running for these questions.
   *
   * Jobs live on the server and survive navigation; the only thing a refresh threw
   * away was the id this panel was watching. That left a question mid-analysis looking
   * idle, and pressing the button again started a second job for work already in
   * flight. Asking once per mount turns a reload into "keep waiting" instead of
   * "start over".
   */
  useEffect(() => {
    let cancelled = false;
    const byId = new Map(quiz.map((item) => [item.id, item]));
    void (async () => {
      let jobs: Job[];
      try {
        jobs = (await listJobs(undefined, 100, 0)).items;
      } catch {
        // The page still renders from server data; only the re-attach is lost.
        return;
      }
      if (cancelled) return;
      for (const job of jobs) {
        if (job.ref_type !== "quiz" || job.ref_id === null) continue;
        if (job.status !== "pending" && job.status !== "running") continue;
        const item = byId.get(job.ref_id);
        if (!item) continue;
        if (job.type === "quiz_solution") {
          patch(item, { solutionLoading: true });
          void watchSolution(item, job.id);
        } else if (job.type === "quiz_answer_analysis") {
          patch(item, { analysisLoading: true });
          void watchAnalysis(item, job.id);
        } else if (job.type === "quiz_grade") {
          patch(item, { submitting: true });
          void watchGrade(item, job.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once per mount on purpose: this is about what survived the reload, not about
    // the `quiz` prop changing under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Restore focus once a submission's disabling clears, the same house pattern as
   * ConceptPractice, ReteachConcept, DaysOffControl, DeadlineForm and DeleteCourseButton:
   * every path here that reaches this effect got here by disabling the control the
   * learner used to submit, which blurs it to the body, so the guard only has to ask
   * whether the learner is still there. A learner who tabbed away mid-request is where
   * they want to be, and pulling them back is worse than the problem being fixed.
   */
  useEffect(() => {
    for (const item of quiz) {
      const wanted = pendingFocus.current.get(item.id);
      if (!wanted) continue;
      pendingFocus.current.delete(item.id);
      if (document.activeElement !== document.body) continue;
      if (wanted === "correct") {
        correctRefs.current.get(item.id)?.focus();
        continue;
      }
      const answer = stateOf(item).answer;
      const target =
        item.kind === "mcq" || item.kind === "truefalse"
          ? mcqRefs.current.get(item.id)?.get(answer)
          : item.kind === "code"
            ? codeRefs.current.get(item.id)
            : inputRefs.current.get(item.id);
      target?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, quiz]);

  // quiz_progress is the tally at load; items answered for the first time here move it.
  const newlyAnswered = quiz.filter(
    (item) =>
      item.attempt_state.attempts === 0 && (answers[item.id]?.attemptState.attempts ?? 0) > 0,
  ).length;
  const answeredCount = progress.answered + newlyAnswered;

  // Both job kinds resolve through the same poll: grading returns a verdict, hints
  // return a hint. Every field is optional because the poller cannot know which job it
  // is waiting on; each caller reads the one it asked for.
  async function pollJob(jobId: string, maxAttempts = 60): Promise<JobResult> {
    for (let i = 0; i < maxAttempts; i++) {
      const job = await getJob(jobId);
      if (job.status === "completed") return job.result as unknown as JobResult;
      if (job.status === "failed") throw new Error(job.error || "Job failed");
      if (job.status === "cancelled") throw new Error("Job cancelled");
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Job timed out");
  }

  async function requestHint(item: QuizItem) {
    const state = stateOf(item);
    const level = state.hints.length + 1;
    if (level > 3 || state.hintLoading) return;
    patch(item, { hintLoading: true });
    try {
      const { job_id } = await startHintJob(item.id, level);
      const result = await pollJob(job_id);
      const hint = result.hint;
      if (!hint) throw new Error("The hint job finished without a hint.");
      patch(item, (prev) => ({ hints: [...prev.hints, hint], hintLoading: false }));
    } catch (err) {
      patch(item, (prev) => ({
        error: err instanceof ApiError ? err.message : t("Could not reach the server."),
        errorKind: "server" as const,
        errorNonce: prev.errorNonce + 1,
        hintLoading: false,
      }));
    }
  }

  /**
   * Explain the question itself. Deliberately independent of what the learner wrote:
   * the server prompt for this route never receives the answer, so opening it before
   * answering produces the same text as opening it after.
   */
  /** One shape for every failed start or poll, so no branch forgets to clear its flag. */
  function failWith(item: QuizItem, err: unknown, clear: Partial<ItemState>) {
    patch(item, (prev) => ({
      error: err instanceof ApiError ? err.message : t("Could not reach the server."),
      errorKind: "server" as const,
      errorNonce: prev.errorNonce + 1,
      ...clear,
    }));
  }

  /**
   * Wait for a solution job that already exists. Split from `loadSolution` so a page
   * that reloads mid-job can re-attach to it: the job survives navigation, and the
   * only thing a refresh used to lose was the id needed to watch it.
   */
  async function watchSolution(item: QuizItem, jobId: string) {
    try {
      const result = await pollJob(jobId);
      patch(item, {
        solution: String(result.solution ?? ""),
        solutionOpen: true,
        solutionLoading: false,
      });
    } catch (err) {
      failWith(item, err, { solutionLoading: false });
    }
  }

  async function loadSolution(item: QuizItem) {
    if (stateOf(item).solutionLoading) return;
    patch(item, { solutionLoading: true });
    try {
      const { job_id } = await startQuestionSolutionJob(item.id);
      await watchSolution(item, job_id);
    } catch (err) {
      failWith(item, err, { solutionLoading: false });
    }
  }

  /**
   * Review the answer just submitted. The opposite half of `loadSolution`: this one
   * is told not to re-teach the question, only to say how the answer did.
   */
  async function watchAnalysis(item: QuizItem, jobId: string) {
    try {
      const result = await pollJob(jobId);
      patch(item, {
        analysis: String(result.analysis ?? ""),
        analysisOpen: true,
        analysisLoading: false,
      });
    } catch (err) {
      failWith(item, err, { analysisLoading: false });
    }
  }

  async function loadAnalysis(item: QuizItem) {
    if (stateOf(item).analysisLoading) return;
    patch(item, { analysisLoading: true });
    try {
      const { job_id } = await startAnswerAnalysisJob(item.id);
      await watchAnalysis(item, job_id);
    } catch (err) {
      failWith(item, err, { analysisLoading: false });
    }
  }

  async function submit(item: QuizItem) {
    const { answer, attachments } = stateOf(item);
    if (!answer.trim() && attachments.length === 0) {
      // Pressing "Check answer" again on a still-empty field re-sets the identical
      // literal; bumping errorNonce off the prior value (not a value closed over above)
      // is what forces the paragraph below to remount and re-announce.
      patch(item, (prev) => ({
        error: "Enter an answer first.",
        errorKind: "validation",
        errorNonce: prev.errorNonce + 1,
      }));
      return;
    }
    patch(item, { submitting: true, error: null, errorKind: null });
    try {
      const { job_id } = await startGradeJob(
        item.id,
        answer,
        attachments.map((row) => row.id),
      );
      await watchGrade(item, job_id);
    } catch (err) {
      failWith(item, err, { submitting: false });
    }
  }

  /**
   * Apply a grading job's verdict. Separate from `submit` because the job outlives the
   * page: a refresh between "Check answer" and the verdict used to leave the question
   * looking unanswered while the server had already recorded the attempt.
   */
  function applyGrade(item: QuizItem, result: JobResult) {
    // Time a retry from this attempt, not from the first time the item appeared.
    markShown(shownAt.current, item.id, true);
    // `ever_correct`, not `result.correct`: an item solved earlier that takes another
    // wrong attempt still unmounts its button, so it is solved-ness, not this
    // attempt's own verdict, that decides which control survives to land focus on.
    pendingFocus.current.set(item.id, result.attempt_state.ever_correct ? "correct" : "answer");
    patch(item, {
      feedback: {
        correct: result.correct,
        expected: result.expected,
        aiFeedback: result.feedback ?? null,
      },
      attemptState: result.attempt_state,
      // A review of the previous answer must not survive a new one: side by side
      // with the new verdict it reads as a review of that verdict.
      analysis: null,
      analysisOpen: false,
      submitting: false,
    });
  }

  async function watchGrade(item: QuizItem, jobId: string) {
    try {
      applyGrade(item, await pollJob(jobId));
    } catch (err) {
      failWith(item, err, { submitting: false });
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-subtitle">{t("Check your understanding")}</h2>
        <p className="text-small tabular-nums text-ink-muted">
          {t("{0} of {1} answered", answeredCount, progress.items)}</p>
      </div>

      <ol className="mt-4 flex flex-col gap-6">
        {pagedQuiz.map((item, index) => {
          const state = stateOf(item);
          // ever_correct spans every attempt, so an item solved earlier stays solved.
          const solved = state.attemptState.ever_correct;
          return (
            <li key={item.id}>
              {/*
                Card, not a hand-rolled border: this is the app's one card shape (see
                Card.tsx), the same primitive courses/page.tsx already nests inside its
                own <li>. `bg-surface` is new (the raw version had no fill, only the
                page's own background showing through); the two are the same colour, so
                nothing renders differently.
              */}
              <Card>
                {/*
                  The explicit {" "} is load-bearing, not formatting. This <p> names both
                  the MCQ radiogroup and the short-answer input via aria-labelledby, and an
                  accessible name is built from text content: `mr-2` is a margin and
                  contributes nothing to it, while JSX drops the newline between the two.
                  Without the space a screen reader says "1.Which orbit shape".
                */}
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-end gap-1"><AnswerHistory key={item.id} questionId={item.id} />{renderItemAction?.(item)}</div>
                  <div id={`quiz-question-${item.id}`} className="flex min-w-0 flex-1 gap-2 text-ui font-medium">
                    <span className="shrink-0 text-ink-subtle">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <QuizMarkdown content={item.question} />
                    </div>
                  </div>
                </div>
                {item.concept && (
                  /*
                    text-small, not text-micro: "Concept: X" is a sentence-case caption
                    and text-micro is uppercase and tracked-out by convention (see
                    globals.css's type scale comment, and LessonMarkdown's heading
                    comment for the same reasoning applied to this same page).
                  */
                  <p className="mt-1 text-small text-ink-subtle">{t("Concept: ")}{item.concept}</p>
                )}

                {item.kind === "mcq" || item.kind === "truefalse" ? (
                  <div
                    className="mt-3 flex flex-col gap-2"
                    /*
                      Without this there is no group at all, only loose radios with no
                      question attached. Named from the question <p> above rather than an
                      sr-only legend (which is what ConceptPractice and ReviewSession use),
                      since the real question text is already there under an id, and the
                      short-answer input below names itself from the same one.
                    */
                    role="radiogroup"
                    aria-labelledby={`quiz-question-${item.id}`}
                  >
                    {item.options.map((option) => (
                      <label
                        key={option}
                        className="flex cursor-pointer items-start gap-2 text-ui"
                      >
                        <input
                          type="radio"
                          name={`quiz-${item.id}`}
                          value={option}
                          checked={state.answer === option}
                          disabled={state.submitting || solved}
                          onChange={() =>
                            // A stale "Enter an answer first." no longer applies the
                            // moment an option is picked; a server error is left alone
                            // (see ErrorKind above) since picking an option doesn't undo
                            // the last request having failed.
                            patch(item, (prev) =>
                              prev.errorKind === "validation"
                                ? { answer: option, error: null, errorKind: null }
                                : { answer: option },
                            )
                          }
                          className="mt-1 shrink-0"
                          ref={(el) => {
                            // Only the checked option's node is worth keeping: it is the
                            // one the focus effect looks up by the current answer, and an
                            // unchecked sibling holding a stale entry would never be read.
                            const options = mcqRefs.current.get(item.id) ?? new Map();
                            if (state.answer === option) {
                              if (el) options.set(option, el);
                              else options.delete(option);
                              mcqRefs.current.set(item.id, options);
                            }
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <QuizMarkdown content={option} />
                        </div>
                      </label>
                    ))}
                  </div>
                ) : item.kind === "code" ? (
                  courseId ? (
                    <Link
                      href={`/courses/${courseId}/quiz/${item.id}?returnTo=${encodeURIComponent(returnHref ?? `/courses/${courseId}/quiz`)}`}
                      className="mt-3 inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-small font-medium text-accent transition-colors hover:border-accent"
                    >
                      {t("Open the code question")}
                      <span aria-hidden>→</span>
                    </Link>
                  ) : (
                    <p className="mt-3 text-small text-ink-muted">
                      {t("Code questions open on their own page.")}
                    </p>
                  )
                ) : item.kind === "short" ? (
                  /*
                    A short answer gets the box that takes files; fill-in keeps the plain
                    input. The split is the point of separating the two kinds: a fill
                    answer is one term and a picture cannot be that term.
                  */
                  <AttachmentInput
                    value={state.answer}
                    onChange={(value) =>
                      patch(item, (prev) =>
                        prev.errorKind === "validation"
                          ? { answer: value, error: null, errorKind: null }
                          : { answer: value },
                      )
                    }
                    attachments={state.attachments}
                    onAttachmentsChange={(next) => patch(item, { attachments: next })}
                    disabled={state.submitting || solved}
                    labelledBy={`quiz-question-${item.id}`}
                    textareaRef={(el) => {
                      if (el) inputRefs.current.set(item.id, el);
                      else inputRefs.current.delete(item.id);
                    }}
                    onSubmit={() => void submit(item)}
                    onError={(message) =>
                      patch(item, (prev) => ({
                        error: message,
                        errorKind: "server",
                        errorNonce: prev.errorNonce + 1,
                      }))
                    }
                  />
                ) : (
                  <input
                    type="text"
                    value={state.answer}
                    disabled={state.submitting || solved}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Same reasoning as the mcq onChange just above: a validation
                      // complaint about the answer goes stale the moment the answer
                      // changes, a server error does not.
                      patch(item, (prev) =>
                        prev.errorKind === "validation"
                          ? { answer: value, error: null, errorKind: null }
                          : { answer: value },
                      );
                    }}
                    ref={(el) => {
                      if (el) inputRefs.current.set(item.id, el);
                      else inputRefs.current.delete(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submit(item);
                      }
                    }}
                    placeholder={t("Your answer")}
                    aria-labelledby={`quiz-question-${item.id}`}
                    className="mt-3 w-full rounded-control border border-line-strong bg-transparent px-3 py-2 text-ui text-ink placeholder:text-ink-subtle transition-colors duration-fast ease-standard hover:border-line-hover focus:border-line-hover disabled:opacity-60"
                  />
                )}

                {/* role="alert" (implicitly assertive) rather than sitting inside the
                    polite region below, for two reasons. This is a response to something
                    the learner just did, so it should interrupt rather than queue behind
                    the result announcement; and the region below is documented as
                    carrying the RESULT, so folding a validation error into it would make
                    that comment false. Same shape as DeleteCourseButton's error. */}
                {state.error && (
                  <p
                    key={state.errorNonce}
                    role="alert"
                    className="mt-3 text-small text-danger"
                  >
                    {state.error}
                  </p>
                )}

                {/* aria-live so the result is announced regardless of where focus lands.
                    Focus does NOT stay on the submit button: checking an answer disables
                    the control that made the request, which blurs it to the body, and the
                    effect above returns focus deliberately, to the answer control while the
                    item is still open to a retry, or to the message below once solving it
                    has taken the button and left the inputs disabled. */}
                <div aria-live="polite">
                  {/* `solved` covers an item answered correctly at some point, including
                      from a source whose latest attempt was wrong (possible once review
                      sessions exist), so a solved item always reads as solved. */}
                  {solved && (
                    <p
                      ref={(el) => {
                        if (el) correctRefs.current.set(item.id, el);
                        else correctRefs.current.delete(item.id);
                      }}
                      tabIndex={-1}
                      /*
                        No `outline-none` here either, for the same reason as the text
                        input above, with one addition worth spelling out: this is exactly
                        the case globals.css's own comment on the app-wide focus rule
                        calls out by name, a `tabIndex={-1}` node that receives `.focus()`
                        after a mutation rather than a native focusable element, which is
                        why that rule is unscoped instead of targeting only
                        button/a/input. The ring still has to show up here, and it does,
                        for the same unlayered-beats-layered reason.
                      */
                      className="mt-3 rounded-control bg-success-surface px-3 py-2 text-small font-medium text-success"
                    >
                      {t("Correct")}</p>
                  )}

                  {state.feedback && !state.feedback.correct && (
                    <p className="mt-3 rounded-control bg-danger-surface px-3 py-2 text-small text-danger">
                      {solved
                        ? t("Last answer was incorrect, expected: ")
                        : t("Incorrect, expected: ")}
                      <span className="font-medium">{state.feedback.expected}</span>
                    </p>
                  )}
                  {state.feedback?.aiFeedback && (
                    <p className="mt-3 rounded-control border border-line bg-surface-sunken px-3 py-2 text-small">
                      <span className="font-medium">{t("AI verdict: ")}</span>
                      {state.feedback.aiFeedback}
                    </p>
                  )}
                  {item.kind === "code" && state.feedback && !state.feedback.correct && (
                    <div className="mt-3">
                      {state.hints.map((h) => (
                        <p
                          key={h.level}
                          className="mb-2 rounded-control border border-line bg-surface-sunken px-3 py-2 text-small"
                        >
                          <span className="font-medium">
                            {t("Hint {0}: ", h.level)}
                          </span>
                          {h.hint}
                        </p>
                      ))}
                      {state.hints.length < 3 && !solved && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={state.hintLoading}
                          onClick={() => void requestHint(item)}
                        >
                          {state.hintLoading
                            ? t("Loading hint…")
                            : state.hints.length === 0
                              ? t("Get a hint")
                              : t("Get hint {0}", state.hints.length + 1)}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {!solved && item.kind !== "code" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void submit(item)}
                    disabled={state.submitting}
                    className="mt-3"
                  >
                    {state.submitting ? t("Checking…") : state.feedback ? t("Try again") : t("Check answer")}
                  </Button>
                )}

                {/*
                  Two reviews, two buttons, because they answer different questions.
                  "Explain the question" never sees this learner's answer, so it is
                  offered before answering too. "Review my answer" only exists once
                  there is an answer, and is told not to re-teach the question.
                */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={state.solutionLoading}
                    onClick={() =>
                      state.solution
                        ? patch(item, { solutionOpen: !state.solutionOpen })
                        : void loadSolution(item)
                    }
                  >
                    {state.solutionLoading
                      ? t("Loading explanation…")
                      : state.solution
                        ? state.solutionOpen
                          ? t("Hide explanation")
                          : t("Show explanation")
                        : t("Explain the question")}
                  </Button>
                  {state.attemptState.attempts > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={state.analysisLoading}
                      onClick={() =>
                        state.analysis
                          ? patch(item, { analysisOpen: !state.analysisOpen })
                          : void loadAnalysis(item)
                      }
                    >
                      {state.analysisLoading
                        ? t("Reviewing…")
                        : state.analysis
                          ? state.analysisOpen
                            ? t("Hide review")
                            : t("Show review")
                          : t("Review my answer")}
                    </Button>
                  )}
                </div>

                {state.solutionOpen && state.solution && (
                  <div className="mt-3 rounded-control border border-line bg-surface-sunken px-4 py-3">
                    <p className="text-micro uppercase text-ink-subtle">
                      {t("Question explained")}
                    </p>
                    <QuizMarkdown content={state.solution} />
                  </div>
                )}
                {state.analysisOpen && state.analysis && (
                  <div className="mt-3 rounded-control border border-line bg-surface-sunken px-4 py-3">
                    <p className="text-micro uppercase text-ink-subtle">
                      {t("Your answer, reviewed")}
                    </p>
                    <QuizMarkdown content={state.analysis} />
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
      {totalPages > 1 && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Pagination
            current={page}
            total={quiz.length}
            pageSize={PAGE_SIZE}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
          />
        </div>
      )}
    </section>
  );
}
