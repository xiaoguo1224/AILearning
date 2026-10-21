/**
 * A code question's submission is its answer: the server grades it against the
 * question with the model and returns the verdict reason as `feedback`.
 * QuizSection renders that verdict under the correct/incorrect block; other
 * kinds never carry one.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { answerQuiz } from "@/lib/api";

import { answerResult, quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  answerQuiz: vi.fn(),
}));

describe("code answer AI verdict", () => {
  test("renders the verdict reason returned for a code answer", async () => {
    const item = quizItem({ id: 1, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const box = screen.getByPlaceholderText(/Ctrl\+Enter/);
    fireEvent.change(box, { target: { value: "def add(a, b):\n    return a+b" } });
    vi.mocked(answerQuiz).mockResolvedValueOnce(
      answerResult({ correct: true, expected: "def add(a, b):\n    return a + b", feedback: "实现正确。" }),
    );
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("实现正确。")).toBeTruthy());
    expect(screen.getByText(/AI verdict/)).toBeTruthy();
  });

  test("no verdict block for a short answer", async () => {
    const item = quizItem({ id: 2, kind: "short" });
    const { container } = render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "和" } });
    vi.mocked(answerQuiz).mockResolvedValueOnce(
      answerResult({ correct: true, expected: "和" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => expect(screen.getByText("Correct")).toBeTruthy());
    expect(container.textContent).not.toContain("AI verdict");
  });
});
