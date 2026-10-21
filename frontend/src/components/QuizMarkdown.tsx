import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { MermaidBlock } from "@/components/MermaidBlock";

/**
 * Markdown for a quiz question or option.
 *
 * AI-generated questions arrive as markdown (code fences, **bold**, $formulas$),
 * and rendering them as plain text shows the raw syntax — the "renders wrong"
 * report. This is the lesson pipeline (math, diagrams, code) without the
 * lesson-specific parts: no heading ids (they would collide with the lesson
 * TOC's toc-n scheme) and no title stripping.
 */
export function QuizMarkdown({ content }: { content: string }) {
  return (
    <div className="quiz-markdown min-w-0 break-words [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted [&_code]:break-all [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-small [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-surface-sunken [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children, ...props }) {
            const child = Array.isArray(children) ? children[0] : children;
            const childProps = (
              child as { props?: { className?: string; children?: unknown } } | null
            )?.props;
            const language = /language-(\w+)/.exec(childProps?.className || "")?.[1];
            if (language === "mermaid") {
              const chart = String(childProps?.children ?? "").trim();
              return <MermaidBlock key={chart} chart={chart} />;
            }
            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
