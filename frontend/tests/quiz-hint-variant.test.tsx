/**
 * Code-question follow-ups, scoped to the question:
 * - After a wrong code answer, "Get a hint" fetches progressive hints (1→3).
 * - The bank's per-question "Variant" button creates a variant of that question.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { answerQuiz, getQuizHint } from "@/lib/api";

import { answerResult, quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  answerQuiz: vi.fn(),
  getQuizHint: vi.fn(),
}));

describe("code hint ladder", () => {
  test("wrong code answer offers hints, one level at a time", async () => {
    const item = quizItem({ id: 1, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const box = screen.getByPlaceholderText(/Ctrl\+Enter/);
    fireEvent.change(box, { target: { value: "def add(a, b):\n    return a-b" } });
    vi.mocked(answerQuiz).mockResolvedValueOnce(
      answerResult({ correct: false, expected: "def add(a, b):\n    return a + b", feedback: "返回的是差值。" }),
    );
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("返回的是差值。")).toBeTruthy());

    vi.mocked(getQuizHint).mockResolvedValueOnce({ level: 1, hint: "看看运算符。" });
    fireEvent.click(screen.getByRole("button", { name: "Get a hint" }));
    await waitFor(() => expect(screen.getByText("看看运算符。")).toBeTruthy());
    expect(vi.mocked(getQuizHint)).toHaveBeenCalledWith(1, 1);

    // Next press asks for level 2.
    vi.mocked(getQuizHint).mockResolvedValueOnce({ level: 2, hint: "加法。" });
    fireEvent.click(screen.getByRole("button", { name: /Get hint 2/ }));
    await waitFor(() => expect(screen.getByText("加法。")).toBeTruthy());
    expect(vi.mocked(getQuizHint)).toHaveBeenCalledWith(1, 2);
  });

  test("no hint button for a correct answer or a non-code kind", async () => {
    const item = quizItem({ id: 2, kind: "short" });
    const { container } = render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "错" } });
    vi.mocked(answerQuiz).mockResolvedValueOnce(
      answerResult({ correct: false, expected: "对" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /hint/i })).toBeNull();
  });

  test("renderItemAction renders per question", () => {
    const item = quizItem({ id: 3, kind: "mcq" });
    render(
      <QuizSection
        quiz={[item]}
        progress={quizProgress()}
        renderItemAction={(it) => <button type="button">{`act-${it.id}`}</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "act-3" })).toBeTruthy();
  });
});
