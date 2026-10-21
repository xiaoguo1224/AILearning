/**
 * Code question detail: tabs for question / answer / review / history.
 * Submitting code creates a question-scoped submission and jumps to review;
 * history switches between versions.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { CodeQuestionDetail } from "@/components/CodeQuestionDetail";
import {
  createQuestionSubmission,
  getSubmission,
  listQuestionSubmissions,
} from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createQuestionSubmission: vi.fn(),
  getSubmission: vi.fn(),
  listQuestionSubmissions: vi.fn(),
}));

// SubmissionReviewPanel is heavy; stub it to its contract.
vi.mock("@/components/SubmissionReviewPanel", () => ({
  SubmissionReviewPanel: ({ submissionId }: { submissionId: number }) => (
    <div data-testid={`review-${submissionId}`}>review panel</div>
  ),
}));

const ITEM = {
  id: 11,
  question: "# 两数相加\n\n写一个函数。",
  kind: "code",
  options: [],
  concept: "函数",
  attempt_state: {},
};

const SUBMISSION = {
  id: 21,
  project_id: null,
  quiz_item_id: 11,
  exercise_id: null,
  version: 1,
  status: "submitted",
  user_note: null,
  variant_id: null,
  created_at: "2026-10-21T10:00:00",
  artifacts: [
    {
      id: 31,
      filename: "answer.py",
      kind: "code",
      content: "def add(a, b):\n    return a + b",
      size_bytes: 30,
      truncated: false,
      sha256: "x",
      created_at: "2026-10-21T10:00:00",
    },
  ],
  reviews: [],
  privacy_warnings: [],
};

describe("CodeQuestionDetail", () => {
  test("submitting code jumps to the review tab", async () => {
    vi.mocked(listQuestionSubmissions).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(createQuestionSubmission).mockResolvedValue(SUBMISSION as never);
    vi.mocked(getSubmission).mockResolvedValue(SUBMISSION as never);

    render(<CodeQuestionDetail courseId={3} item={ITEM as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "Answer" }));
    fireEvent.change(screen.getByLabelText("Your code"), {
      target: { value: "def add(a, b):\n    return a + b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    expect(vi.mocked(createQuestionSubmission)).toHaveBeenCalledWith(11, {
      code: "def add(a, b):\n    return a + b",
      log_content: undefined,
      user_note: undefined,
    });
    await waitFor(() => expect(screen.getByTestId("review-21")).toBeTruthy());
  });

  test("history lists versions and switching changes the review", async () => {
    const v2 = { ...SUBMISSION, id: 22, version: 2 };
    vi.mocked(listQuestionSubmissions).mockResolvedValue({
      items: [v2, SUBMISSION],
      total: 2,
    } as never);
    vi.mocked(getSubmission).mockImplementation(async (id: number) =>
      (id === 22 ? v2 : SUBMISSION) as never,
    );

    render(<CodeQuestionDetail courseId={3} item={ITEM as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    await waitFor(() => expect(screen.getByText("v2")).toBeTruthy());

    // Newest is selected by default; switch to v1.
    fireEvent.click(screen.getByRole("button", { name: /v1/ }));
    await waitFor(() => expect(screen.getByTestId("review-21")).toBeTruthy());
  });
});
