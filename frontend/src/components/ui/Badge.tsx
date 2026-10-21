// @ts-nocheck
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
  return <Tag color={COLOR_MAP[tone]} {...props as any}>{children}</Tag>;
}
