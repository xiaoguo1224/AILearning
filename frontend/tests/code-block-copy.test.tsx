import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { render } from "./render";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { QuizMarkdown } from "@/components/QuizMarkdown";

vi.mock("@/components/MermaidBlock", () => ({ MermaidBlock: () => <div>diagram</div> }));

test.each(["lesson", "quiz"])("%s code blocks copy exact source including whitespace", async kind => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const content = "```python\ndef add(a, b):\n    return a + b\n```\n\n````\nplain code\n````\n\n`inline`";
  render(kind === "lesson" ? <LessonMarkdown title="Lesson" content={content} /> : <QuizMarkdown content={content} />);
  expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Copy code" })[0]);
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("def add(a, b):\n    return a + b\n"));
  expect(screen.getAllByRole("status")[0]).toHaveTextContent("Copied");
});

test("clipboard failure is reported while leaving code selectable", async () => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
  render(<QuizMarkdown content={"```\nselect me\n```"} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copy failed"));
  expect(screen.getByText("select me")).toBeInTheDocument();
});
