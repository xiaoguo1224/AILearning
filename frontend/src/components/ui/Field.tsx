"use client";
import { Input } from "antd";
import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: ReactNode;
}

/**
 * The label is bound to the input with htmlFor/id, not just rendered above it.
 *
 * antd's Input renders the real <input>, so a bare <label> with no htmlFor names
 * nothing: a screen reader reads "Knowledge point" as loose text, and `getByLabelText`
 * (which is how the diagnosis tests drive this form) cannot find the control at all.
 * Callers that already own an id keep it; the rest get a generated one.
 *
 * The error line is wired the same way, so the message is announced with the field
 * rather than sitting next to it.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, id, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div>
      {label && <label htmlFor={inputId}>{label}</label>}
      <Input
        ref={ref as never}
        id={inputId}
        aria-describedby={error ? errorId : undefined}
        {...(props as Record<string, unknown>)}
      />
      {error && (
        <div id={errorId} style={{ color: "red" }}>
          {error}
        </div>
      )}
    </div>
  );
});
