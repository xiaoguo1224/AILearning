// @ts-nocheck
"use client";
import { Alert } from "antd";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  message?: ReactNode;
  action?: ReactNode;
}

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  { message, action, children, ...props },
  ref,
) {
  return (
    <div ref={ref} {...props}>
      <Alert type="error" message={message ?? children} action={action} showIcon />
    </div>
  );
});
