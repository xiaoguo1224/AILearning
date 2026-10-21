/**
 * The lesson sidebar TOC: extractToc pulls ##/### headings in order with
 * positional ids, and LessonMarkdown tags its rendered h2/h3 with the same
 * ids so the anchor links land.
 */
import { render, screen } from "./render";
import { describe, expect, test } from "vitest";

import { LessonMarkdown } from "@/components/LessonMarkdown";
import { extractToc } from "@/lib/toc";

const CONTENT = `# 标题

## 注意力机制

正文

### 缩放点积

\`\`\`python
# 这是代码，不是标题
x = 1
\`\`\`

## 多头注意力
`;

describe("extractToc", () => {
  test("lists h2/h3 in order with positional ids, skipping code fences", () => {
    expect(extractToc(CONTENT)).toEqual([
      { id: "toc-0", level: 2, text: "注意力机制" },
      { id: "toc-1", level: 3, text: "缩放点积" },
      { id: "toc-2", level: 2, text: "多头注意力" },
    ]);
  });

  test("returns empty for content without subheadings", () => {
    expect(extractToc("# 只有标题\n\n正文")).toEqual([]);
  });
});

describe("LessonMarkdown heading ids", () => {
  test("h2/h3 carry the toc ids in the same order", () => {
    const { container } = render(<LessonMarkdown content={CONTENT} title="标题" />);
    const h2s = Array.from(container.querySelectorAll("h2")).map((h) => h.id);
    const h3s = Array.from(container.querySelectorAll("h3")).map((h) => h.id);
    expect(h2s).toEqual(["toc-0", "toc-2"]);
    expect(h3s).toEqual(["toc-1"]);
    // The anchor targets exist for every TOC entry.
    for (const entry of extractToc(CONTENT)) {
      expect(container.querySelector(`#${entry.id}`)).toBeTruthy();
    }
    expect(screen.getByText("注意力机制")).toBeTruthy();
  });
});
