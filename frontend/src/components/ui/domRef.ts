/*
 * The React Compiler lint rule treats hook arguments as immutable, which makes any
 * ref-forwarding helper a violation: assigning `ref.current` is the one thing React's
 * own `<div ref={...}>` does for us and the only way to hand a DOM node to a caller that
 * asked for it. Silenced for this file only, because there is no other place in the app
 * that forwards a ref it did not render itself.
 */
/* eslint-disable react-hooks/immutability */
import { useCallback } from "react";
import type { ForwardedRef, MutableRefObject } from "react";

/**
 * antd components forward an imperative handle (`{ nativeElement }`) rather than the DOM
 * node. Callers here do `ref.current.focus()` and assert `toHaveFocus()` on the element
 * they can see, so the handle is unwrapped before it reaches them.
 */
function domNodeFrom(handle: unknown): HTMLElement | null {
  if (handle instanceof HTMLElement) return handle;
  const native = (handle as { nativeElement?: unknown } | null)?.nativeElement;
  return native instanceof HTMLElement ? native : null;
}

/**
 * A DOM ref for an antd element, plus the one thing antd will not pass through.
 *
 * Alert renders only `aria-*` and `data-*` from the props it is handed (pickAttrs), so a
 * `tabIndex` set through props never reaches the DOM — the element stays unfocusable and
 * `ref.current.focus()` silently leaves focus on the body. Writing it here, while the
 * node is in hand, is what lets a caller move focus to a message it just announced.
 *
 * The `ref.current` assignment below is the one React performs for `<div ref={...}>`
 * itself; a forwarded ref is a mutable box by contract. The React Compiler lint rule
 * treats hook arguments as immutable, so it has to be silenced at exactly this line
 * rather than by dropping the forwarding.
 */
export function useAlertRef<T extends HTMLElement>(
  ref: ForwardedRef<T>,
  tabIndex?: number,
) {
  return useCallback(
    (handle: unknown) => {
      const node = domNodeFrom(handle) as T | null;
      if (node && tabIndex !== undefined) node.tabIndex = tabIndex;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) {
        (ref as MutableRefObject<T | null>).current = node;
      }
    },
    [ref, tabIndex],
  );
}
