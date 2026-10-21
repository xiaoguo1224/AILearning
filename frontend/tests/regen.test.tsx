/**
 * Regeneration, split into lesson and course levels with per-lesson adopt/discard:
 * - RegenerateLessonButton: feedback -> draft preview (editable) -> adopt/discard.
 * - RegenDraftPreview: edit mode, adopt passes the edited draft, discard drops it.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { RegenDraftPreview } from "@/components/RegenDraftPreview";
import { RegenerateLessonButton } from "@/components/RegenerateLessonButton";
import { patchLesson, streamLessonRegeneration } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  streamLessonRegeneration: vi.fn(),
  patchLesson: vi.fn(),
}));

async function* fakeStream(events: unknown[]) {
  for (const event of events) yield event;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DRAFT = { title: "注意力", content: "# 注意力\n\n新内容。", concepts: ["注意力"] };

describe("RegenDraftPreview", () => {
  test("adopt passes the edited draft; discard drops it", () => {
    const onAdopt = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RegenDraftPreview draft={DRAFT} adopting={false} onAdopt={onAdopt} onDiscard={onDiscard} />,
    );
    // Preview first.
    expect(screen.getAllByText("注意力").length).toBeGreaterThan(0);
    // Edit the content, then adopt.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const contentBox = screen.getByLabelText("Content") as HTMLTextAreaElement;
    fireEvent.change(contentBox, { target: { value: "# 注意力\n\n改过的内容。" } });
    fireEvent.click(screen.getByRole("button", { name: "Adopt" }));
    expect(onAdopt).toHaveBeenCalledWith({
      title: "注意力",
      content: "# 注意力\n\n改过的内容。",
      concepts: ["注意力"],
    });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  test("discard calls onDiscard without adopting", () => {
    const onAdopt = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RegenDraftPreview draft={DRAFT} adopting={false} onAdopt={onAdopt} onDiscard={onDiscard} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
    expect(onAdopt).not.toHaveBeenCalled();
  });
});

describe("RegenerateLessonButton", () => {
  test("streams a draft with progress, then adopting PATCHes the lesson", async () => {
    vi.mocked(streamLessonRegeneration).mockImplementation(() =>
      fakeStream([
        { type: "regen_started", lesson_id: 5, title: "注意力" },
        { type: "regen_draft", lesson_id: 5, draft: DRAFT },
        { type: "regen_done" },
      ]) as never,
    );
    vi.mocked(patchLesson).mockResolvedValue({} as never);
    render(<RegenerateLessonButton lessonId={5} />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. too hard, add more examples"), {
      target: { value: "多举例子" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(vi.mocked(streamLessonRegeneration)).toHaveBeenCalledWith(
      5,
      "多举例子",
      expect.objectContaining({}),
    );

    // Progress shows while the draft streams in.
    expect(screen.getByText("Rewriting the lesson…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Review the new draft")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Adopt" }));
    await waitFor(() => expect(vi.mocked(patchLesson)).toHaveBeenCalledWith(5, {
      title: "注意力",
      content: "# 注意力\n\n新内容。",
      concepts: ["注意力"],
    }));
  });
});
