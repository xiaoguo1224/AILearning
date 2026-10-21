// @ts-nocheck
"use client";
import { Input } from "antd";
import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, ...props },
  ref,
) {
  return (
    <div>
      {label && <label>{label}</label>}
      <Input ref={ref as never} {...(props as never)} />
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
});
