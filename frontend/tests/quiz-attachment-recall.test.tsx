/**
 * What a learner submitted comes back with the question.
 *
 * Reported as "附件上传后，就无法查看了，这样我以后就不知道我回答了什么内容了":
 * the attachment chips were local state, so re-opening a question that had been
 * answered with a scanned page showed an empty box and no way to see the file.
 * The attempt now carries its attachments, and each chip opens the stored bytes.
 */
import { render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { QuizSection } from "@/components/QuizSection";
import { attachmentUrl } from "@/lib/api";

import { quizItem, quizProgress } from "./fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getJob: vi.fn(),
  startGradeJob: vi.fn(),
}));

describe("a submitted answer comes back", () => {
  test("the file it was answered with is shown and can be opened", () => {
    const item = quizItem({
      id: 5,
      kind: "short",
      attempt_state: {
        attempts: 1,
        first_attempt_correct: true,
        ever_correct: true,
        latest_quiz_attempt: {
          answer: "",
          correct: true,
          expected: "防止点积过大导致 softmax 饱和",
          created_at: "2026-10-23T05:00:00+00:00",
          attachments: [
            { id: 42, filename: "reshape与permute的区别.docx", kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1234 },
          ],
        },
      },
    });

    render(<QuizSection quiz={[item]} progress={quizProgress()} />);

    const link = screen.getByRole("link", { name: /reshape与permute的区别\.docx/ });
    expect(link.getAttribute("href")).toBe(attachmentUrl(42));
    // A new tab: the answer and the page state stay where they were.
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("an attempt with no files shows no chips", () => {
    const item = quizItem({
      id: 6,
      kind: "short",
      attempt_state: {
        attempts: 1,
        first_attempt_correct: true,
        ever_correct: true,
        latest_quiz_attempt: {
          answer: "用一句话回答",
          correct: true,
          expected: "用一句话回答",
          created_at: "2026-10-23T05:00:00+00:00",
        },
      },
    });

    render(<QuizSection quiz={[item]} progress={quizProgress()} />);
    expect(screen.queryByRole("link", { name: /打开|Open/ })).toBeNull();
  });
});