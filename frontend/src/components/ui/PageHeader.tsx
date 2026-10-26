"use client";
import { Typography } from "antd";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

// `title` is the page heading, not the HTML tooltip attribute.
export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader(
  { title, description, actions, children, ...props },
  ref,
) {
  return (
    <div ref={ref} {...props}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        {/*
          Level 1, not 2: this is the page's own title, and several error branches render
          it on its own to keep the page from having no heading at all. At level 2 those
          pages had no h1 for a screen reader to announce.
        */}
        <Typography.Title level={1} style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{title ?? children}</Typography.Title>
        {actions && <div>{actions}</div>}
      </div>
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
    </div>
  );
});
