"use client";

import { useI18n } from "@/components/LocaleProvider";
import { extractToc } from "@/lib/toc";

/**
 * In-lesson table of contents, rendered as a sticky sidebar. Anchor links jump
 * to the headings LessonMarkdown tagged with the matching positional ids.
 * Hidden below lg: on narrow screens the lesson is one column and the TOC
 * would push content down.
 */
export function LessonToc({ content }: { content: string }) {
  const { t } = useI18n();
  const entries = extractToc(content);
  if (entries.length === 0) return null;

  return (
    <nav aria-label={t("Contents")} className="hidden lg:block">
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <p className="text-micro font-semibold uppercase tracking-wide text-ink-muted">
          {t("Contents")}
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 border-l border-line pl-4">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.level === 3 ? "ml-3" : ""}>
              <a
                href={`#${entry.id}`}
                className="block text-small text-ink-muted transition-colors hover:text-accent"
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
