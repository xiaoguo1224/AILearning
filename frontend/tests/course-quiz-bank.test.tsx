/**
 * The course's question bank lives on its own page now:
 * - the card on the course page is a way IN (a link), not the bank itself;
 * - /courses/{id}/quiz lists every question of every lesson, grouped as the
 *   course is, with a per-kind breakdown that cannot go stale while answering.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { CourseQuizBank } from "@/components/CourseQuizBank";
import { CourseQuizSection } from "@/components/CourseQuizSection";
import { getCourseQuiz } from "@/lib/api";
import type { QuizBank } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCourseQuiz: vi.fn(),
}));

const UNANSWERED = {
  attempts: 0,
  ever_correct: false,
  first_attempt_correct: false,
  latest_quiz_attempt: null,
} as never;

function bank(items: { id: number; question: string; kind: string }[]): QuizBank {
  return {
    course_id: 7,
    total: items.length,
    modules: [
      {
        id: 1,
        title: "第一章 入门",
        lessons: [
          { id: 11, title: "第 1 课时", items: items.slice(0, 1).map((i) => ({ ...i, options: [], concept: "c", attempt_state: UNANSWERED, solution: null })) },
          { id: 12, title: "第 2 课时", items: items.slice(1).map((i) => ({ ...i, options: ["A", "B"], concept: "c", attempt_state: UNANSWERED, solution: null })) },
        ],
      },
    ],
  };
}

describe("course question bank", () => {
  test("the course page's card links to the bank instead of listing questions", async () => {
    vi.mocked(getCourseQuiz).mockResolvedValue(
      bank([
        { id: 1, question: "Which orbit stays at constant altitude?", kind: "mcq" },
        { id: 2, question: "用一句话解释广播", kind: "short" },
      ]),
    );
    render(<CourseQuizSection courseId={7} />);

    const link = await waitFor(() => screen.getByRole("link", { name: /Questions/ }));
    expect(link.getAttribute("href")).toBe("/courses/7/quiz");
    await waitFor(() => expect(screen.getByText(/2 questions in this course/)).toBeTruthy());
    // The questions themselves are on the other page now.
    expect(screen.queryByText("Which orbit stays at constant altitude?")).toBeNull();
  });

  test("the bank page lists every lesson's questions under its module", async () => {
    vi.mocked(getCourseQuiz).mockResolvedValue(
      bank([
        { id: 1, question: "Which orbit stays at constant altitude?", kind: "mcq" },
        { id: 2, question: "用一句话解释广播", kind: "short" },
        { id: 3, question: "实现 broadcast_to", kind: "code" },
      ]),
    );
    render(<CourseQuizBank courseId={7} courseTitle="PyTorch 核心机制课程" />);

    // The chapter appears twice by design: once in the table of contents, once as
    // the section heading it links to.
    expect(await screen.findAllByText("第一章 入门")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /第一章 入门/ }).getAttribute("href")).toBe(
      "#chapter-1",
    );
    expect(screen.getByText("第 1 课时")).toBeTruthy();
    expect(screen.getByText("第 2 课时")).toBeTruthy();
    expect(screen.getByText("Which orbit stays at constant altitude?")).toBeTruthy();
    expect(screen.getByText("用一句话解释广播")).toBeTruthy();
    // A code question links to its own page rather than answering inline.
    expect(screen.getByRole("link", { name: /Open the code question/ })).toBeTruthy();
  });

  test("a chapter collapses, and can generate for itself", async () => {
    vi.mocked(getCourseQuiz).mockResolvedValue(
      bank([
        { id: 1, question: "Which orbit stays at constant altitude?", kind: "mcq" },
        { id: 2, question: "用一句话解释广播", kind: "short" },
      ]),
    );
    render(<CourseQuizBank courseId={7} courseTitle="PyTorch 核心机制课程" />);

    const heading = await screen.findByRole("button", { name: /第一章 入门/ });
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Which orbit stays at constant altitude?")).toBeTruthy();

    fireEvent.click(heading);
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    // Collapsed, not unmounted: a half-typed answer must survive folding the chapter
    // away and back. `hidden` takes the body out of the accessibility tree and off
    // the page, which is what the attribute assertion below pins.
    expect(document.getElementById("chapter-body-1")?.hasAttribute("hidden")).toBe(true);

    // Per-chapter generation opens the same dialog the lesson page uses, scoped to
    // this chapter's lessons rather than to the whole course.
    fireEvent.click(screen.getByRole("button", { name: "Generate for this chapter" }));
    expect(await screen.findByText("AI 出题")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Scope" })).toBeTruthy();
  });

  test("an empty bank offers to generate rather than showing a blank page", async () => {
    vi.mocked(getCourseQuiz).mockResolvedValue(bank([]));
    render(<CourseQuizBank courseId={7} courseTitle="空课程" />);
    expect(await screen.findByText("This course has no questions yet.")).toBeTruthy();
  });
});