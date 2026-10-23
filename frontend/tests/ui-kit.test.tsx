/**
 * ErrorState's role override, locked in because it was a real defect.
 *
 * The component announces itself as `role="alert"` by default, since it is usually
 * the only thing on screen worth announcing. A caller nesting one inside a region
 * that is ALREADY a live region has to be able to turn that off, or the message is
 * announced twice.
 *
 * The first implementation wrote `role = "alert"` in the destructure. That reads as
 * a default and is not one: a destructuring default fires on `undefined`, so a
 * caller passing `role={undefined}` got "alert" handed back rather than the
 * attribute removed, and a destructured prop never reaches `...props` either, so
 * there was no second path for the caller's value to arrive by. The override was
 * unreachable by construction while looking, in the source, exactly like it worked.
 *
 * The fix is to keep `role` OUT of the destructure so it stays in `...props`, and to
 * write the default on the element before the spread. React then omits an attribute
 * whose spread value is `undefined`, which is what makes suppression possible at all.
 *
 * The middle test is the one that matters. Asserting only the default and a
 * replacement role would still pass against the broken version; passing `undefined`
 * explicitly is the only case that distinguishes them.
 */
import { fireEvent, render, screen } from "./render";
import { describe, expect, test, vi } from "vitest";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";

describe("ErrorState role", () => {
  test("announces itself as an alert by default", () => {
    render(<ErrorState message="The backend is unreachable." />);

    expect(screen.getByRole("alert")).toHaveTextContent("The backend is unreachable.");
  });

  test("role={undefined} removes the attribute rather than restoring the default", () => {
    const { container } = render(
      <ErrorState role={undefined} message="Nested in a live region already." />,
    );

    expect(container.firstElementChild?.hasAttribute("role")).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a caller can substitute its own role", () => {
    render(<ErrorState role="status" message="Quieter announcement." />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * ErrorState has no heading of its own any more: antd's Alert renders the message in a
 * title slot that is skipped when empty. What still matters is the reason the old test
 * existed — an empty string must not produce an empty block above the message, which is
 * what a `title !== undefined` check would do.
 */
describe("ErrorState empty message", () => {
  test('title="" adds nothing above the message', () => {
    const { container } = render(<ErrorState title="" message="x" />);

    expect(container.textContent).toBe("x");
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

/**
 * `type = "button"` is a load-bearing default, not a tidiness one. HTML's own default
 * for a <button> with no type is "submit", so dropping that word from Button's
 * destructure turns every unadorned Button inside a <form> into a submit control. The
 * migration this PR performs replaces raw <button> elements with this primitive across
 * GenerateForm, which is one large form, so the blast radius is that whole page.
 *
 * The second test catches the regression, and it leans on a negative assertion, which
 * is worth nothing on its own: if this primitive silently stopped rendering, or the
 * click never landed, `not.toHaveBeenCalled()` would pass for the wrong reason. The
 * first test is its control. Same form, same click, same handler, differing only in the
 * prop under test, so a broken harness fails both instead of quietly passing one.
 *
 * Run, not assumed: rewriting the destructure to a bare `type` fails the second test on
 * "Number of calls: 1" while the first still passes. The behaviour assertion is checked
 * before the attribute one deliberately, so that failure lands on the submit that
 * actually happened rather than on a missing attribute.
 */
describe("Button type default", () => {
  function FormHarness({ onSubmit, type }: { onSubmit: () => void; type?: "submit" }) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Button type={type}>Go</Button>
      </form>
    );
  }

  test('type="submit" submits the surrounding form (control for the test below)', () => {
    const onSubmit = vi.fn();
    render(<FormHarness onSubmit={onSubmit} type="submit" />);

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "submit");
  });

  test("an unadorned Button does not submit the surrounding form", () => {
    const onSubmit = vi.fn();
    render(<FormHarness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });
});

/**
 * `tinted` is the outline-style action used inside a status-tinted Callout. The variant
 * used to inherit its colour from the wrapper through `border-current`; that guarantee
 * died with the antd migration, which maps it to antd's link button and its own colour.
 *
 * What is asserted here is only what the kit still promises: the variant maps to the
 * link treatment and not to a solid fill, so it stays visually subordinate to the
 * Callout's own primary action. A colour-inheritance guarantee would have to come back
 * as a component decision, not as a class assertion in this file.
 */
describe("Button tinted variant", () => {
  test("maps to the link treatment rather than a solid fill", () => {
    render(<Button variant="tinted">Generate another</Button>);
    const tokens = screen
      .getByRole("button", { name: "Generate another" })
      .className.split(/\s+/)
      .filter(Boolean);

    expect(tokens).toContain("ant-btn-variant-link");
    expect(tokens).not.toContain("ant-btn-variant-solid");
  });
});
