"use client";
import { Tag } from "antd";
import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const COLOR_MAP: Record<BadgeTone, string> = {
  neutral: "default",
  success: "success",
  warning: "warning",
  danger: "error",
};

export function Badge({ tone = "neutral", children, ...props }: BadgeProps) {
  // Tag accepts the span attributes this interface declares; the cast only widens the
  // rest object to Tag's own prop type so the spread type-checks.
  return (
    <Tag color={COLOR_MAP[tone]} {...(props as Record<string, unknown>)}>
      {children}
    </Tag>
  );
}
