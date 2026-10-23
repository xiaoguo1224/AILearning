"use client";

import { Button as AntButton } from "antd";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "tinted" | "danger";
export type ButtonSize = "sm" | "md";

// `size` here is this kit's own two-step scale, not the HTML attribute antd would take.
export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size" | "color"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_MAP: Record<ButtonVariant, "primary" | "default" | "text" | "link"> = {
  primary: "primary",
  secondary: "default",
  ghost: "text",
  tinted: "link",
  danger: "primary",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <AntButton
      ref={ref as never}
      type={VARIANT_MAP[variant]}
      htmlType={type}
      size={size === "sm" ? "small" : "middle"}
      danger={variant === "danger"}
      {...(props as Record<string, unknown>)}
    />
  );
});
