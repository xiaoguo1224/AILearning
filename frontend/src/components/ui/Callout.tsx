// @ts-nocheck
"use client";
import { Alert } from "antd";
import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type CalloutTone = "info" | "success" | "warning" | "danger";
export interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CalloutTone;
  title?: string;
}

export const Callout = forwardRef<HTMLDivElement, CalloutProps>(function Callout(
  { tone = "info", title, children, className, style, ...props },
  ref,
) {
  return (
    <div ref={ref} className={className} style={style} {...props}>
      <Alert type={tone === "danger" ? "error" : tone} message={title} description={children} showIcon />
    </div>
  );
});
