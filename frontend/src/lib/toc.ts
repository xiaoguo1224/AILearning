/**
 * Table of contents for a lesson's markdown: its ## and ### headings in
 * document order, each with a stable anchor id.
 *
 * The ids are positional (`toc-0`, `toc-1`, …) rather than slugged text, so
 * Chinese headings — the common case here — need no URL-encoding scheme to
 * agree on. LessonMarkdown assigns the same ids to the rendered headings by
 * counting its h2/h3 components in the same order, so the two never disagree.
 * Code fences are skipped: a "# " inside a fenced block is not a heading.
 */
export interface TocEntry {
  id: string;
  level: 2 | 3;
  text: string;
}

const HEADING = /^(#{2,3})\s+(.+?)\s*#*\s*$/;
const FENCE = /^```/;

export function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (FENCE.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const text = match[2].replace(/[*_`]/g, "").trim();
    if (!text) continue;
    entries.push({
      id: `toc-${entries.length}`,
      level: match[1].length as 2 | 3,
      text,
    });
  }
  return entries;
}
