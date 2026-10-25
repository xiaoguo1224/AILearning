"use client";

import { useState, type ComponentPropsWithoutRef, type ReactElement } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { MermaidBlock } from "@/components/MermaidBlock";

export function CopyCodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const child = (Array.isArray(children) ? children[0] : children) as ReactElement<{ className?: string; children?: string }> | null;
  const code = String(child?.props?.children ?? "");
  const language = /language-([^\s]+)/.exec(child?.props?.className ?? "")?.[1];
  if (language === "mermaid") return <MermaidBlock chart={code.trim()} />;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="min-w-0 max-w-full rounded-control bg-surface-sunken">
      <div className="flex items-center justify-between gap-3 px-3 pt-2 text-small text-ink-muted">
        <span>{language ?? ""}</span>
        <button type="button" onClick={() => void copy()} className="shrink-0 rounded px-2 py-1 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
          {t("Copy code")}
        </button>
        <span role="status" className="sr-only">{status === "copied" ? t("Copied") : status === "failed" ? t("Copy failed. Select and copy the code manually.") : ""}</span>
        {status === "copied" && <span aria-hidden="true">{t("Copied")}</span>}
        {status === "failed" && <span aria-hidden="true">{t("Copy failed. Select and copy the code manually.")}</span>}
      </div>
      <pre {...props} className={`m-0 max-w-full overflow-x-auto p-4 ${props.className ?? ""}`}>{children}</pre>
    </div>
  );
}
