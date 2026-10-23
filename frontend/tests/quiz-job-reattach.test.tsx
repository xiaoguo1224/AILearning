/**
 * A reload must not reset what is in flight.
 *
 * Jobs live on the server and survive navigation, so the only thing a refresh used to
 * throw away was the id the panel was watching. That left a question mid-analysis
 * looking idle — and pressing the button again bought a second job for the same work.
 * On mount the panel asks the job list what is still running for these questions and
 * keeps waiting.
 */
import { render, screen, waitFor } from "./render";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { getJob, listJobs, startAnswerAnalysisJob } from "@/lib/api";
import type { Job } from "@/lib/api";

import { quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  startAnswerAnalysisJob: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function answeredItem() {
  return quizItem({
    id: 3,
    kind: "short",
    attempt_state: {
      attempts: 1,
      first_attempt_correct: false,
      ever_correct: false,
      latest_quiz_attempt: {
        answer: "my answer",
        correct: false,
        expected: "the reference",
        created_at: "2026-10-23T00:00:00Z",
        attachments: [],
      },
    },
  });
}

function runningJob(refId = 3): Job {
  return {
    id: "analysis-job",
    type: "quiz_answer_analysis",
    status: "running",
    progress: { stage: "analysing", attempt_id: 1 },
    result: null,
    trace: null,
    error: null,
    ref_type: "quiz",
    ref_id: refId,
    href: "/courses/7/quiz",
    created_at: "2026-10-23T00:00:00Z",
    updated_at: "2026-10-23T00:00:00Z",
  };
}

describe("re-attaching to a job after a reload", () => {
  test("a job still running keeps the panel in its loading state", async () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [runningJob()], total: 1 });
    // Never settles: the point is what the panel shows WHILE the job is in flight.
    vi.mocked(getJob).mockReturnValue(new Promise(() => {}));

    render(<QuizSection quiz={[answeredItem()]} progress={quizProgress({ answered: 1 })} />);

    expect(await screen.findByRole("button", { name: "Reviewing…" })).toBeDisabled();
    expect(startAnswerAnalysisJob).not.toHaveBeenCalled();
  });

  test("the result of the resumed job lands without starting a new one", async () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [runningJob()], total: 1 });
    vi.mocked(getJob).mockResolvedValue({
      ...runningJob(),
      status: "completed",
      result: { analysis: "方向对了。" },
    });

    render(<QuizSection quiz={[answeredItem()]} progress={quizProgress({ answered: 1 })} />);

    await waitFor(() => expect(screen.getByText("方向对了。")).toBeTruthy());
    expect(startAnswerAnalysisJob).not.toHaveBeenCalled();
  });

  test("a job for another question is left alone", async () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [runningJob(999)], total: 1 });

    render(<QuizSection quiz={[answeredItem()]} progress={quizProgress({ answered: 1 })} />);

    expect(await screen.findByRole("button", { name: "Review my answer" })).toBeEnabled();
    expect(getJob).not.toHaveBeenCalled();
  });
});
