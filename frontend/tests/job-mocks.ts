/**
 * Grading and hints are background jobs now: the component calls `startGradeJob`, then
 * polls `getJob` until the job completes. Tests that only mock the old direct endpoints
 * (`answerQuiz`, `getQuizHint`) leave the component waiting on an unmocked fetch, which
 * reads as "the request never settled" rather than "the endpoint changed".
 *
 * These helpers route a submission through the two calls the component actually makes.
 * Each test file still declares its own `vi.mock` factory; the mocked module is shared,
 * so importing it here reaches the same functions the component imports.
 */
import { vi } from "vitest";

import { getJob, startGradeJob, startHintJob } from "@/lib/api";
import type { QuizHint } from "@/lib/api";
import type { AnswerResult } from "@/lib/types";

export function gradeJobId(id = "grade-job"): { job_id: string } {
  return { job_id: id };
}

/** Make the next grade submission complete immediately with `result`. */
export function completeGradeWith(result: AnswerResult) {
  vi.mocked(startGradeJob).mockResolvedValue(gradeJobId());
  vi.mocked(getJob).mockResolvedValue({ status: "completed", result } as never);
}

/** Make the next hint request complete immediately with `hint`. */
export function completeHintWith(hint: QuizHint) {
  vi.mocked(startHintJob).mockResolvedValue({ job_id: "hint-job" });
  vi.mocked(getJob).mockResolvedValue({ status: "completed", result: { hint } } as never);
}

/** Make the next grade submission fail the way a rejected request would. */
export function failGradeWith(error: unknown) {
  vi.mocked(startGradeJob).mockRejectedValue(error);
}
