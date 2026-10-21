// @ts-nocheck
"use client";
import { Typography } from "antd";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export interface PageHeaderProps extends HTMLAttributes<HTMLDivElement> {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography.Title level={2} style={{ margin: 0 }}>{title ?? children}</Typography.Title>
        {actions && <div>{actions}</div>}
      </div>
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
    </div>
  );
});
