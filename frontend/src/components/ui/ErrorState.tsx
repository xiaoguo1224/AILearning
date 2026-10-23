"use client";
import { forwardRef } from "react";
import { Alert } from "antd";
import type { HTMLAttributes, ReactNode } from "react";

import { useAlertRef } from "./domRef";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  message?: ReactNode;
  action?: ReactNode;
}

/**
 * Same placement as Callout, for the same two reasons: `role` belongs on the antd Alert
 * (the real live region, and the only place where `undefined` can remove the default
 * role="alert"), and the ref must resolve to that same DOM node so `ref.current.focus()`
 * lands the learner on the announced reason.
 *
 * Keeping `role` out of the destructure is load-bearing: a destructured prop never
 * reaches `...rest`, and a destructuring default fires on `undefined`, so
 * `role={undefined}` would silently restore "alert" instead of removing the attribute.
 */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  props,
  ref,
) {
  // `title` is destructured out on purpose: HTMLAttributes declares it as the tooltip
  // attribute, while antd's Alert uses `title` for its message slot. Letting it fall
  // through to Alert would replace the message with a tooltip string — and an empty
  // one would erase the error entirely.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured to strip it, not to read it
  const { message, action, children, role, tabIndex, title: _htmlTitle, ...rest } = props;
  // "role is absent" keeps Alert's default role="alert"; "role is undefined" asks for
  // the attribute to be removed. Destructuring alone cannot tell those apart.
  const roleGiven = Object.prototype.hasOwnProperty.call(props, "role");
  const domRef = useAlertRef(ref, tabIndex);
  return (
    <Alert
      ref={domRef as never}
      {...(roleGiven ? { role } : {})}
      type="error"
      title={message ?? children}
      action={action}
      showIcon
      {...rest}
    />
  );
});
