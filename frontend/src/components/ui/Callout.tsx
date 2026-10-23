"use client";
import { forwardRef } from "react";
import { Alert } from "antd";
import type { HTMLAttributes } from "react";

import { useAlertRef } from "./domRef";

export type CalloutTone = "info" | "success" | "warning" | "danger";
export interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CalloutTone;
  title?: string;
}

/**
 * There is deliberately no wrapper element: every prop lands on the antd Alert, which
 * is the element that is actually on screen and the one that owns role="alert".
 *
 * That placement is what makes the role override work. Alert renders `role="alert"`
 * and then spreads its props over the same node, so `role="status"` replaces it and
 * `role={undefined}` removes the attribute — the two things a caller nesting a callout
 * inside an existing live region needs. A wrapper carrying its own role would leave two
 * live regions for one message and announce it twice.
 */
export const Callout = forwardRef<HTMLDivElement, CalloutProps>(function Callout(
  props,
  ref,
) {
  const { tone = "info", title, children, role, tabIndex, ...rest } = props;
  // "role is absent" and "role is undefined" are different requests: the first keeps
  // Alert's own role="alert", the second asks for the attribute to be removed. Only
  // hasOwnProperty can tell them apart once destructuring has run.
  const roleGiven = Object.prototype.hasOwnProperty.call(props, "role");
  const domRef = useAlertRef(ref, tabIndex);
  return (
    <Alert
      ref={domRef as never}
      {...(roleGiven ? { role } : {})}
      type={tone === "danger" ? "error" : tone}
      title={title}
      description={children}
      showIcon
      {...rest}
    />
  );
});
