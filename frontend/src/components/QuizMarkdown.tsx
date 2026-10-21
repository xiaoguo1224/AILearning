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
    <div
      className="quiz-markdown min-w-0 break-words"
      style={{
        fontSize: 14,
        lineHeight: 1.8,
        color: "var(--ink)",
      }}
    >
      <style>{`
        .quiz-markdown h1, .quiz-markdown h2, .quiz-markdown h3, .quiz-markdown h4 {
          font-weight: 600;
          margin: 20px 0 10px;
          line-height: 1.4;
        }
        .quiz-markdown h1 { font-size: 18px; }
        .quiz-markdown h2 { font-size: 16px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
        .quiz-markdown h3 { font-size: 15px; }
        .quiz-markdown p { margin: 10px 0; }
        .quiz-markdown ul, .quiz-markdown ol { margin: 10px 0; padding-left: 24px; }
        .quiz-markdown ul { list-style: disc; }
        .quiz-markdown ol { list-style: decimal; }
        .quiz-markdown li { margin: 6px 0; }
        .quiz-markdown li::marker { color: var(--accent); font-weight: 600; }
        .quiz-markdown code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          background: color-mix(in srgb, var(--accent) 8%, transparent);
          color: var(--accent);
          padding: 2px 6px;
          border-radius: 4px;
          word-break: break-all;
        }
        .quiz-markdown pre {
          background: #1e1e1e;
          border-radius: 10px;
          padding: 16px;
          margin: 14px 0;
          overflow-x: auto;
          max-width: 100%;
        }
        .quiz-markdown pre code {
          background: transparent;
          color: #d4d4d4;
          padding: 0;
          font-size: 13px;
          line-height: 1.6;
        }
        .quiz-markdown blockquote {
          border-left: 3px solid var(--accent);
          padding: 8px 16px;
          margin: 12px 0;
          color: var(--ink-muted);
          background: var(--surface);
          border-radius: 0 8px 8px 0;
        }
        .quiz-markdown table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .quiz-markdown th, .quiz-markdown td {
          border: 1px solid var(--line);
          padding: 8px 12px;
          text-align: left;
          font-size: 13px;
        }
        .quiz-markdown th { background: var(--surface); font-weight: 600; }
        .quiz-markdown hr {
          border: none;
          border-top: 1px solid var(--line);
          margin: 20px 0;
        }
        .quiz-markdown a { color: var(--accent); text-decoration: underline; }
        .quiz-markdown strong { font-weight: 600; }
      `}</style>
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
