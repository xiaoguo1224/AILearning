import { render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";
import CodeQuestionPage from "@/app/courses/[courseId]/quiz/[itemId]/page";
import { getQuizItem, listQuestionSubmissions } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getQuizItem: vi.fn(),
  listQuestionSubmissions: vi.fn(),
}));

describe("code question return destination", () => {
  test.each([
    ["/courses/3/quiz", "/courses/3/quiz"],
    ["/courses/3/lessons/9/quiz", "/courses/3/lessons/9/quiz"],
    ["/courses/3/lessons/9", "/courses/3/lessons/9"],
    [undefined, "/courses/3/quiz"],
    ["https://example.com", "/courses/3/quiz"],
    ["//example.com", "/courses/3/quiz"],
    ["/courses/4/quiz", "/courses/3/quiz"],
    ["/courses/3/quiz/11", "/courses/3/quiz"],
    ["/courses/3/lessons/9/../..", "/courses/3/quiz"],
    [["/courses/3/quiz", "https://example.com"], "/courses/3/quiz"],
  ])("validates returnTo %j", async (returnTo, expected) => {
    vi.mocked(getQuizItem).mockResolvedValue({ id: 11, kind: "code", question: "实现加法", options: [], concept: "加法" } as never);
    vi.mocked(listQuestionSubmissions).mockResolvedValue({ items: [], total: 0 });
    const page = await CodeQuestionPage({
      params: Promise.resolve({ courseId: "3", itemId: "11" }),
      searchParams: Promise.resolve({ returnTo }),
    });
    render(page);
    expect(await screen.findByRole("link", { name: /Back to previous page/ })).toHaveAttribute("href", expected);
  });
});
