/**
 * The question bank's new kinds render with the right controls:
 * - truefalse renders as two radios (like mcq), fed by the server's options.
 * - code renders as a textarea, where Enter keeps newlines and Ctrl+Enter submits.
 * - short renders as a textarea that takes file attachments (Enter is a newline,
 *   Ctrl/Cmd+Enter submits); fill keeps the single-line input where Enter submits.
 */
import { render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";

import { quizItem, quizProgress } from "./fixtures";

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

  test("code links to its detail page instead of answering inline", () => {
    const item = quizItem({ id: 2, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} courseId={7} />);
    const link = screen.getByRole("link", { name: /Open the code question/ });
    expect(link.getAttribute("href")).toBe("/courses/7/quiz/2?returnTo=%2Fcourses%2F7%2Fquiz");
  });

  test("short answers in a multi-line box that takes files", () => {
    const item = quizItem({ id: 3, kind: "short" });
    const { container } = render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    // A short answer is prose plus evidence: Enter inserts a newline, so the control
    // is a textarea rather than the one-line input fill-in still uses.
    expect(container.querySelector("textarea")).toBeTruthy();
    // The upload area sits under the box as a button plus a file list.
    expect(screen.getByRole("button", { name: "Click to upload" })).toBeTruthy();
  });

  test("fill keeps the single-line input", () => {
    const item = quizItem({ id: 4, kind: "fill" });
    const { container } = render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
    expect(container.querySelector("textarea")).toBeNull();
  });

});
