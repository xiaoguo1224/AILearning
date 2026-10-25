import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { render } from "./render";
import { AnswerHistory } from "@/components/AnswerHistory";
import { generateHistoryAnalysis, getAnswerHistory, getJob, listAnswerHistory } from "@/lib/api";

vi.mock("@/lib/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  generateHistoryAnalysis: vi.fn(), getAnswerHistory: vi.fn(), listAnswerHistory: vi.fn(), getJob: vi.fn(),
}));
vi.mock("@/components/MermaidBlock", () => ({ MermaidBlock: () => <div>diagram</div> }));

const detail = {
  id: 7, source: "lesson_quiz", created_at: "2026-10-25T01:00:00+00:00",
  can_generate: true, has_analysis: false, has_solution: false,
  snapshot: { complete: true, question: "Original question", submitted_answer: "My old answer", correct: false },
  events: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAnswerHistory).mockResolvedValue({ items: [{
    id: 7, question_id: 4, source: "lesson_quiz", created_at: detail.created_at,
    question: "Original question", correct: false, complete: true,
  }], total: 1 });
  vi.mocked(getAnswerHistory).mockResolvedValue(detail);
});

async function openRecord() {
  render(<AnswerHistory questionId={4} />);
  expect(listAnswerHistory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Answer history" }));
  fireEvent.click(await screen.findByRole("button", { name: /Original question/ }));
  await screen.findByText("My old answer");
}

test("history loads lazily and reveals saved answers only on request", async () => {
  await openRecord();
  expect(getAnswerHistory).toHaveBeenLastCalledWith(7, false);
  vi.mocked(getAnswerHistory).mockResolvedValue({ ...detail, snapshot: { ...detail.snapshot, expected: "Saved answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Show saved answers and hints" }));
  expect(await screen.findByText("Saved answer")).toBeInTheDocument();
  expect(getAnswerHistory).toHaveBeenLastCalledWith(7, true);
});

test("missing analysis can be generated for the selected answer and then reused", async () => {
  await openRecord();
  vi.mocked(generateHistoryAnalysis).mockResolvedValue({ job_id: "job-1" });
  vi.mocked(getJob).mockResolvedValue({ id: "job-1", status: "completed" } as never);
  vi.mocked(getAnswerHistory).mockResolvedValue({ ...detail, has_analysis: true, events: [
    { kind: "answer_analysis", created_at: detail.created_at, payload: { analysis: "Saved AI critique" } },
  ] });
  fireEvent.click(screen.getByRole("button", { name: "Generate analysis for this answer" }));
  expect(await screen.findByText("Saved AI critique")).toBeInTheDocument();
  expect(generateHistoryAnalysis).toHaveBeenCalledExactlyOnceWith(7, "analysis");
  expect(screen.queryByRole("button", { name: "Generate analysis for this answer" })).not.toBeInTheDocument();
  expect(screen.getByText("Showing the saved analysis. No new AI call is needed.")).toBeInTheDocument();
});

test("saved analysis opens without an AI request", async () => {
  vi.mocked(getAnswerHistory).mockResolvedValue({ ...detail, has_analysis: true, events: [
    { kind: "answer_analysis", created_at: detail.created_at, payload: { analysis: "Existing analysis" } },
  ] });
  await openRecord();
  expect(screen.getByText("Existing analysis")).toBeInTheDocument();
  expect(generateHistoryAnalysis).not.toHaveBeenCalled();
});

test("a failed request leaves a usable retry and preserves the answer", async () => {
  await openRecord();
  vi.mocked(generateHistoryAnalysis).mockRejectedValue(new Error("AI unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Generate analysis for this answer" }));
  await screen.findByText("AI unavailable");
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate analysis for this answer" })).toBeEnabled());
  expect(screen.getByText("My old answer")).toBeInTheDocument();
});
