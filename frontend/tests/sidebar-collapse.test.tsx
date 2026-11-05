import { fireEvent, render, screen } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { AppSidebar } from "@/components/AppSidebar";
import { LessonLayout } from "@/components/LessonLayout";
import { quizProgress } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/courses/1", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/AnswerHistory", () => ({ AnswerHistory: () => null }));
vi.mock("@/components/LessonQaSection", () => ({ LessonQaSection: () => <div>Lesson Q&A</div> }));
vi.mock("@/components/MermaidBlock", () => ({ MermaidBlock: () => null }));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] })); });

test("desktop navigation can collapse and reopen", () => {
  render(<AppSidebar />);
  const button = screen.getByRole("button", { name: "Collapse navigation" });
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Courses" })).toBeVisible();
  fireEvent.click(button);
  expect(screen.queryByRole("link", { name: "Courses" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));
  expect(screen.getByRole("link", { name: "Courses" })).toBeVisible();
});

test("lesson contents can collapse without hiding the article or Q&A", () => {
  render(<LessonLayout courseId={1} lessonId={2} lessonTitle="Title" content={'## Section\n\nLesson body'} quiz={[]} quizProgress={quizProgress()} disclaimer="Disclaimer" />);
  expect(screen.getByRole("link", { name: /Questions/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Collapse contents" }));
  expect(screen.queryByRole("link", { name: /Questions/ })).toBeNull();
  expect(screen.getByText("Lesson body")).toBeVisible();
  expect(screen.getByText("Lesson Q&A")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Expand contents" }));
  expect(screen.getByRole("link", { name: /Questions/ })).toBeVisible();
});
