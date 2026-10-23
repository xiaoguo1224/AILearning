/**
 * Lesson page sidebar panels:
 * - LessonQuizPanel shows this lesson's questions and generates more for it.
 * - LessonQaSection opens a lesson-scoped Q&A (conceptKey "lesson:{id}").
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { LessonQaSection } from "@/components/LessonQaSection";
import { LessonQuizPanel } from "@/components/LessonQuizPanel";
import { getJob, startQuizGenerateJob } from "@/lib/api";

import { quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  startQuizGenerateJob: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("@/components/ConceptTutor", () => ({
  ConceptTutor: ({ conceptKey }: { conceptKey: string }) => (
    <div data-testid="tutor" data-key={conceptKey} />
  ),
}));

describe("LessonQuizPanel", () => {
  test("shows the lesson's questions and generates for the lesson", async () => {
    const item = quizItem({ id: 1, kind: "mcq" });
    render(
      <LessonQuizPanel courseId={3} lessonId={9} initialQuiz={[item]} progress={quizProgress()} />,
    );
    // Collapsed by default; expand to see the questions.
    expect(screen.queryByText(item.question)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Questions/ }));
    expect(screen.getByText(item.question)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AI generate" }));
    // Generation is a background job now: start it, then poll for the result.
    vi.mocked(startQuizGenerateJob).mockResolvedValue({ job_id: "quiz-job" });
    vi.mocked(getJob).mockResolvedValue({
      status: "completed",
      result: { course_id: 3, lesson_id: 9, created: [] },
    } as never);
    fireEvent.click(screen.getByRole("button", { name: /Generate 2/ }));
    await waitFor(() => expect(vi.mocked(startQuizGenerateJob)).toHaveBeenCalled());
    const [courseId, items, lessonId] = vi.mocked(startQuizGenerateJob).mock.calls[0];
    expect(courseId).toBe(3);
    expect(lessonId).toBe(9);
    expect(items).toEqual([{ kind: "mcq", count: 2 }]);
  });

  test("empty state invites generation", () => {
    render(
      <LessonQuizPanel courseId={3} lessonId={9} initialQuiz={[]} progress={quizProgress()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Questions/ }));
    expect(screen.getByText('No questions for this lesson yet. Generate some with AI.')).toBeTruthy();
  });
});

describe("LessonQaSection", () => {
  test("opens a lesson-scoped tutor on toggle", () => {
    render(<LessonQaSection lessonId={9} lessonTitle="注意力" />);
    // Closed: no transcript fetch.
    expect(screen.queryByTestId("tutor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Q&A" }));
    const tutor = screen.getByTestId("tutor");
    expect(tutor.getAttribute("data-key")).toBe("lesson:9");
  });
});
