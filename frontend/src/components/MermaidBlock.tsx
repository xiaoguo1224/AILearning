"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

/*
 * Renders a ```mermaid fenced block as an SVG diagram. The diagram source is
 * model-generated text parsed by mermaid's own DSL, not HTML, so the
 * no-rehype-raw guarantee in LessonMarkdown still holds: mermaid runs at its
 * default strict security level, which strips anything that is not diagram.
 */
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

export function MermaidBlock({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // The parent keys this component by the chart text, so a new chart remounts
  // with fresh state instead of this effect resetting it mid-lifecycle.
  useEffect(() => {
    let cancelled = false;
    mermaid
      .render(`mermaid-${id}`, chart)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    // The model wrote something mermaid cannot parse: show the source rather
    // than nothing, so the lesson still carries the information.
    return (
      <pre className="overflow-x-auto rounded-control bg-surface-sunken p-4">
        <code className="font-mono text-small">{chart}</code>
      </pre>
    );
  }
  if (svg === null) return null;
  return (
    <div
      className="overflow-x-auto rounded-control border border-line bg-surface p-4"
      // mermaid.render returns sanitized SVG at strict security level.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
