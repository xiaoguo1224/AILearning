/**
 * The completed button's tone, and the reveal that the Undo hint depends on.
 *
 * The tone is no longer a Tailwind fill: the control moved to antd's filled green when
 * the UI kit migrated, because our own Button deliberately has no status-coloured
 * variant. What still has to hold is that the completed state is the success tone and
 * not a neutral one — a swap to the default button would read as "nothing happened".
 *
 * jsdom applies no stylesheet, so these assertions read class names. They guard the
 * specific regression (a tone swap or a lost structural class), not the colours those
 * classes resolve to.
 */
import { render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { MarkCompleteButton } from "@/components/MarkCompleteButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("MarkCompleteButton completed state", () => {
  test("keeps the success tone rather than falling back to a neutral button", () => {
    render(<MarkCompleteButton lessonId={1} completed />);
    const button = screen.getByRole("button", { name: "Mark this lesson as not complete" });
    const tokens = button.className.split(/\s+/);

    expect(tokens).toContain("ant-btn-color-green");
    expect(tokens).toContain("ant-btn-variant-filled");
    // `group` is what makes the hint's group-hover reveal fire at all. Without it the
    // tone assertions above still pass while the hint never appears.
    expect(tokens).toContain("group");
  });

  test("reveals the Undo hint at full opacity, since hover is the only state it is read in", () => {
    render(<MarkCompleteButton lessonId={1} completed />);
    const hint = screen.getByText("Undo");
    const reveals = hint.className
      .split(/\s+/)
      .filter((token) => /^group-(hover|focus-visible):opacity-/.test(token))
      .sort();

    expect(reveals).toEqual([
      "group-focus-visible:opacity-100",
      "group-hover:opacity-100",
    ]);
    // Without `opacity-0` the hint is permanently visible and the reveal means nothing,
    // which neither assertion above would notice.
    expect(hint.className.split(/\s+/)).toContain("opacity-0");
  });
});
