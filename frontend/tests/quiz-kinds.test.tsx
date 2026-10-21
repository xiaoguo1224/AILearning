/**
 * The question bank's new kinds render with the right controls:
 * - truefalse renders as two radios (like mcq), fed by the server's options.
 * - code renders as a textarea, where Enter keeps newlines and Ctrl+Enter submits.
 * - short keeps the single-line input where Enter submits.
 */
import { fireEvent, render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { answerQuiz } from "@/lib/api";
import type { AnswerResult } from "@/lib/types";

import { deferred, quizItem, quizProgress, answerResult } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  answerQuiz: vi.fn(),
}));

describe("question kind controls", () => {
  test("truefalse renders its two options as radios", () => {
    const item = quizItem({ id: 1, kind: "truefalse", options: ["正确", "错误"] });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    expect(screen.getByRole("radio", { name: "正确" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "错误" })).toBeTruthy();
  });

  test("code renders a textarea", () => {
    const item = quizItem({ id: 2, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const box = screen.getByPlaceholderText(/Ctrl\+Enter/);
    expect(box.tagName.toLowerCase()).toBe("textarea");
  });

  test("short keeps the single-line input", () => {
    const item = quizItem({ id: 3, kind: "short" });
    const { container } = render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  test("Enter in the code textarea does not submit, Ctrl+Enter does", async () => {
    const item = quizItem({ id: 4, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    const box = screen.getByPlaceholderText(/Ctrl\+Enter/);
    fireEvent.change(box, { target: { value: "print(1)" } });

    const gate = deferred<AnswerResult>();
    vi.mocked(answerQuiz).mockImplementationOnce(() => gate.promise as never);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(vi.mocked(answerQuiz)).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(vi.mocked(answerQuiz)).toHaveBeenCalledTimes(1);
    gate.resolve(answerResult({ correct: true, expected: "print(1)" }));
  });
});
