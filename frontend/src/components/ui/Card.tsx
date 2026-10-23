"use client";
import { Card as AntCard } from "antd";
import type { HTMLAttributes } from "react";

export type CardPadding = 4 | 5 | 6;
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

export function Card({ children, ...props }: CardProps) {
  // `padding` is part of this wrapper's API for callers, but antd sizes cards itself;
  // dropping it here keeps the prop from reaching the DOM as an unknown attribute.
  return <AntCard {...(props as Record<string, unknown>)}>{children}</AntCard>;
}
