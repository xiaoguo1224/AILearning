/**
 * Regeneration via background jobs:
 * - RegenerateLessonButton: feedback -> job -> draft preview (editable) -> adopt/discard.
 * - RegenDraftPreview: edit mode, adopt passes the edited draft, discard drops it.
 */
import { fireEvent, render, screen, waitFor } from "./render";
import { describe, expect, test, vi } from "vitest";

import { RegenDraftPreview } from "@/components/RegenDraftPreview";
import { RegenerateLessonButton } from "@/components/RegenerateLessonButton";
import { getJob, patchLesson, startLessonRegenJob } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  startLessonRegenJob: vi.fn(),
  getJob: vi.fn(),
  patchLesson: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const DRAFT = { title: "注意力", content: "# 注意力\n\n新内容。", concepts: ["注意力"] };

describe("RegenDraftPreview", () => {
  test("adopt passes the edited draft; discard drops it", () => {
    const onAdopt = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RegenDraftPreview draft={DRAFT} onAdopt={onAdopt} onDiscard={onDiscard} adopting={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("注意力"), { target: { value: "注意力机制" } });
    fireEvent.click(screen.getByRole("button", { name: "Adopt" }));
    expect(onAdopt).toHaveBeenCalledWith({ ...DRAFT, title: "注意力机制" });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  test("discard calls onDiscard without adopting", () => {
    const onAdopt = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RegenDraftPreview draft={DRAFT} onAdopt={onAdopt} onDiscard={onDiscard} adopting={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
    expect(onAdopt).not.toHaveBeenCalled();
  });
});

describe("RegenerateLessonButton", () => {
  test("starts a job, shows progress, then adopting PATCHes the lesson", async () => {
    vi.mocked(startLessonRegenJob).mockResolvedValue({ job_id: "job-1" });
    vi.mocked(getJob).mockResolvedValue({
      id: "job-1",
      type: "lesson_regenerate",
      status: "completed",
      progress: null,
      result: { draft: DRAFT },
      error: null,
      ref_type: "lesson",
      ref_id: 5,
      created_at: "",
      updated_at: "",
    } as never);
    vi.mocked(patchLesson).mockResolvedValue({} as never);
    render(<RegenerateLessonButton lessonId={5} />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. more examples, simpler language…"), {
      target: { value: "多举例子" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(vi.mocked(startLessonRegenJob)).toHaveBeenCalledWith(5, "多举例子");

    // Draft appears when the job completes.
    await waitFor(() => expect(screen.getByText("Review the draft")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Adopt" }));
    await waitFor(() =>
      expect(vi.mocked(patchLesson)).toHaveBeenCalledWith(5, {
        title: "注意力",
        content: "# 注意力\n\n新内容。",
        concepts: ["注意力"],
      }),
    );
  });
});
