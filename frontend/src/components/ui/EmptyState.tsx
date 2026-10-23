"use client";
import { Empty } from "antd";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

// `title` is the visible heading here, not the HTML tooltip attribute.
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
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
