/**
 * The lesson's question page (/courses/{id}/lessons/{id}/quiz) and its "AI 出题"
 * dialog. The dialog renders one row per entry of QUIZ_KINDS, so every kind in
 * that list must have metadata: a kind added to the list without one used to be a
 * runtime crash here (`meta.icon` of undefined), on the one screen that offers to
 * generate questions, and nothing covered it.
 */
import { fireEvent, render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { LessonQuizList } from "@/components/LessonQuizList";
import { listJobs } from "@/lib/api";
import { QUIZ_KINDS } from "@/lib/quizKinds";

import { quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  getLesson: vi.fn(),
  startQuizGenerateJob: vi.fn(),
  startQuizVariantJob: vi.fn(),
}));

describe("LessonQuizList", () => {
  test("code questions return to this lesson's question list", () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [] } as never);
    render(<LessonQuizList courseId={3} lessonId={9} initialQuiz={[quizItem({ id: 1, kind: "code" })]} progress={quizProgress()} />);
    const href = screen.getByRole("link", { name: /Open the code question/ }).getAttribute("href")!;
    expect(new URL(href, "http://localhost").searchParams.get("returnTo")).toBe("/courses/3/lessons/9/quiz");
  });
  test("the generate dialog offers a row for every question kind", () => {
    vi.mocked(listJobs).mockResolvedValue({ items: [] } as never);
    render(
      <LessonQuizList courseId={3} lessonId={9} initialQuiz={[]} progress={quizProgress()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 出题" }));

    // One row per kind: the label comes from quiz_kind_<kind>, so this fails loudly
    // if QUIZ_KINDS grows without the dialog keeping up.
    for (const kind of QUIZ_KINDS) {
      expect(
        screen.getByText(`quiz_kind_${kind}`),
        `the dialog has no row for the "${kind}" kind`,
      ).toBeTruthy();
    }
  });
});
