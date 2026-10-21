// @ts-nocheck
"use client";
import { Empty } from "antd";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, action, children, ...props },
  ref,
) {
  return (
    <div ref={ref} {...props}>
      <Empty description={description ?? title ?? children} />
      {action}
    </div>
  );
});
