import type { ReactElement } from "react";
import { render as renderReact, type RenderOptions } from "@testing-library/react";
import { LocaleProvider } from "@/components/LocaleProvider";

export * from "@testing-library/react";

// Existing English copy assertions run against the actual provider in that locale.
export function render(ui: ReactElement, options?: RenderOptions) {
  const Wrapper = options?.wrapper;
  return renderReact(ui, { ...options, wrapper: ({ children }) => (
    <LocaleProvider locale="en">{Wrapper ? <Wrapper>{children}</Wrapper> : children}</LocaleProvider>
  ) });
}
