import type { ComponentPropsWithoutRef } from "react";

export function MarkdownTable(props: ComponentPropsWithoutRef<"table">) {
  return <div className="markdown-table"><table {...props} /></div>;
}
