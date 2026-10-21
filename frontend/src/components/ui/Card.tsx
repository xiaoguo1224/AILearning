// @ts-nocheck
"use client";
import { Card as AntCard } from "antd";
import type { HTMLAttributes } from "react";

export type CardPadding = 4 | 5 | 6;
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

export function Card({ padding = 5, children, ...props }: CardProps) {
  return <AntCard {...(props as never)}>{children}</AntCard>;
}
