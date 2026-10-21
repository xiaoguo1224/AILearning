import { fireEvent, render, screen } from "./render";
import { beforeEach, expect, test, vi } from "vitest";
import { ContentReviewButton } from "@/components/ContentReviewButton";
import { ApiError, requestContentReview } from "@/lib/api";
import { knowledgeProvenanceLine } from "@/lib/knowledge";
import { createTranslator } from "@/lib/i18n";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/api")>()), requestContentReview: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

test("review action sends only a source locator and opens its review copy", async () => {
  vi.mocked(requestContentReview).mockResolvedValue({ knowledge_id: 8 } as never);
  render(<ContentReviewButton projectId={1} kind="lesson" sourceId={2} />);
  expect(requestContentReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review formulas and examples" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/projects/1/knowledge?entry=8"));
  expect(requestContentReview).toHaveBeenCalledWith(1, "lesson", 2);
});

test("an unrevealed solution refusal does not navigate or claim approval", async () => {
  vi.mocked(requestContentReview).mockRejectedValue(new ApiError(409, "Open the reference solution first"));
  render(<ContentReviewButton projectId={1} kind="solution" sourceId={2} />);
  fireEvent.click(screen.getByRole("button", { name: "Review this reference solution" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Open the reference solution first");
  expect(push).not.toHaveBeenCalled();
});

test("provenance identifies the source version in both languages", () => {
  const source = { lesson_id: 2, source_hash: "123456789abc0000" };
  expect(knowledgeProvenanceLine(source, createTranslator("en"))).toBe("Lesson 2 · source version 123456789abc");
  expect(knowledgeProvenanceLine(source, createTranslator("zh-CN"))).toBe("课时 2 · 来源版本 123456789abc");
});
