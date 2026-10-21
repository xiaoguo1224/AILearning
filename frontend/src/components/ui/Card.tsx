import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

export type CardPadding = 4 | 5 | 6;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  4: "p-4",
  5: "p-5",
  6: "p-6",
};

/**
 * The app's one card shape: a white surface with a soft shadow, no border
 * (MOOC-style: cards float on the gray page). In dark mode the shadow
 * resolves to `none` and the card surface step carries the depth.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 5, className, ...props },
  ref,
) {
  const classes = [
    "rounded-surface bg-surface shadow-raise",
    PADDING_CLASSES[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div ref={ref} className={classes} {...props} />;
});
