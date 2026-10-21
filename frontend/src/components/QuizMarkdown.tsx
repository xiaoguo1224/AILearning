import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { MermaidBlock } from "@/components/MermaidBlock";
import "./QuizMarkdown.css";

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
    <div className="quiz-markdown">
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
