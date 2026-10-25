import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { CopyCodeBlock } from "@/components/CopyCodeBlock";
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
          pre({ children, className }) {
            return <CopyCodeBlock className={className}>{children}</CopyCodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
