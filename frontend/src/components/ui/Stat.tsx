// @ts-nocheck
"use client";
import { Statistic } from "antd";
import type { HTMLAttributes, ReactNode } from "react";

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  title?: string;
  value?: string | number;
  note?: ReactNode;
  emphasis?: boolean;
}

export function Stat({ label, title, value, note, ...props }: StatProps) {
  return (
    <div {...props}>
      <Statistic title={label ?? title} value={value} />
      {note && <div>{note}</div>}
    </div>
  );
}
