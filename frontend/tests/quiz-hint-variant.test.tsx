/**
 * Code-question follow-ups live on the question's own page.
 *
 * The bank used to render a code editor inline, which is where the hint ladder and the
 * AI verdict were reachable from. Both moved out with the editor: a code row now links
 * to `/courses/:id/quiz/:itemId`, and this suite pins that the bank does not offer a
 * second, divergent hint surface. What the hint ladder itself does is covered where it
 * is rendered — see TASKS FIX-03 for moving it onto that page.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { startGradeJob } from "@/lib/api";

import { answerResult, quizItem, quizProgress } from "./fixtures";
import { completeGradeWith } from "./job-mocks";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  startGradeJob: vi.fn(),
  getJob: vi.fn(),
}));

describe("code question entry point", () => {
  test("a code row links to the question's own page and offers no hint control", () => {
    const item = quizItem({ id: 1, kind: "code" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} courseId={3} />);

    expect(screen.getByRole("link", { name: /Open the code question/ })).toHaveAttribute(
      "href",
      "/courses/3/quiz/1",
    );
    expect(screen.queryByRole("button", { name: /hint/i })).toBeNull();
  });
});

describe("hint ladder scope", () => {
  test("no hint button for a non-code kind, even after a wrong answer", async () => {
    const item = quizItem({ id: 2, kind: "short" });
    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    completeGradeWith(answerResult({ correct: false, expected: "对" }));

    const input = screen.getByPlaceholderText("Your answer");
    fireEvent.change(input, { target: { value: "错" } });
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

    await waitFor(() => expect(screen.getByText(/Incorrect/)).toBeTruthy());
    expect(vi.mocked(startGradeJob)).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /hint/i })).toBeNull();
  });
});

describe("per-question actions", () => {
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
