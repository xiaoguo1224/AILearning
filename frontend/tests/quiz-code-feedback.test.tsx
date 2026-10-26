/**
 * Code questions are not answered inside the bank.
 *
 * They moved to their own page (`/courses/:id/quiz/:itemId`) when the review and the
 * submission history grew too large for a bank row, so `QuizSection` renders a link
 * there instead of an editor. These tests pin that split: an inline code editor in the
 * bank would be a second, divergent place to answer the same question.
 *
 * The hint ladder and the AI verdict block still exist in QuizSection's render tree for
 * code items, but nothing can reach them from this component any more — see TASKS
 * FIX-03, which is where relocating them (to the code question page) is tracked.
 */
import { render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";

import { quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
}));

describe("code questions in the bank", () => {
  test("link to their own page rather than rendering an editor", () => {
    const item = quizItem({ id: 1, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} courseId={7} />);

    const link = screen.getByRole("link", { name: /Open the code question/ });
    expect(link).toHaveAttribute("href", "/courses/7/quiz/1?returnTo=%2Fcourses%2F7%2Fquiz");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("carries the lesson question list as the return destination", () => {
    render(<QuizSection quiz={[quizItem({ id: 1, kind: "code" })]} progress={quizProgress()} courseId={7} returnHref="/courses/7/lessons/12/quiz" />);
    const href = screen.getByRole("link", { name: /Open the code question/ }).getAttribute("href")!;
    expect(new URL(href, "http://localhost").searchParams.get("returnTo")).toBe("/courses/7/lessons/12/quiz");
  });

  test("say where they live when the bank has no course to link to", () => {
    const item = quizItem({ id: 2, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);

    expect(screen.getByText("Code questions open on their own page.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("a short answer still gets an inline editor", () => {
    const item = quizItem({ id: 3, kind: "short" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);

    expect(screen.getByPlaceholderText("Your answer")).toBeInTheDocument();
  });
});
