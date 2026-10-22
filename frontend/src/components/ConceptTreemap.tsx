"use client";

import ReactECharts from "echarts-for-react";

import type { ConceptLesson, ConceptNode } from "@/lib/types";
import { useTheme } from "./ThemeProvider";
import { masteryColors, THEMES } from "@/lib/theme";

interface ConceptTreemapProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
}

const LESSON_PALETTE = [
  { dark: "#243329", light: "#e5ede1" },
  { dark: "#243438", light: "#e3eceb" },
  { dark: "#30312d", light: "#ecebdf" },
  { dark: "#30312f", light: "#e8e9e2" },
  { dark: "#293529", light: "#e0eadb" },
];

/**
 * Treemap of AI-extracted concepts sized by importance (1-5).
 * Groups concepts by their introducing lesson.
 */
export function ConceptTreemap({ lessons, concepts }: ConceptTreemapProps) {
  const { theme } = useTheme();
  const p = THEMES[theme];
  const colors = masteryColors(theme);
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  // Group concepts by lesson.
  const byLesson = new Map<number, ConceptNode[]>();
  for (const c of concepts) {
    const arr = byLesson.get(c.lesson_id) ?? [];
    arr.push(c);
    byLesson.set(c.lesson_id, arr);
  }

  const data = Array.from(byLesson.entries()).map(([lessonId, nodes], lessonIndex) => {
    const lesson = lessonMap.get(lessonId);
    return {
      name: lesson?.title ?? `Lesson ${lessonId}`,
      children: nodes.map((n) => {
        // For not_started, use diverse lesson-based colors.
        let bg: string = colors[n.bucket] ?? p.untouched;
        const textColor = n.bucket === "not_started" ? p.ink : n.bucket === "mastered" && theme === "light" ? "#ffffff" : "#153322";
        if (n.bucket === "not_started") {
          const palette = LESSON_PALETTE[lessonIndex % LESSON_PALETTE.length];
          bg = palette[theme];
        }
        return {
          name: n.concept_label,
          // Importance 1-5 scaled for visible size differences.
          value: (n as ConceptNode & { importance?: number }).importance ?? 3,
          itemStyle: {
            color: bg,
          },
          label: {
            color: textColor,
          },
        };
      }),
    };
  });

  const option = {
    tooltip: {
      renderMode: "richText",
      backgroundColor: p.surface,
      borderColor: p.line,
      textStyle: { color: p.ink },
      formatter: (info: { name: string; value: number }) =>
        `${info.name}\n重要程度: ${info.value}/5`,
    },
    series: [
      {
        type: "treemap",
        data,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: "{b}",
          fontSize: 13,
        },
        upperLabel: {
          show: true,
          height: 32,
          color: p.onFill,
          backgroundColor: p.accent,
          fontSize: 13,
          fontWeight: 500,
        },
        itemStyle: {
          borderColor: p.app,
          borderWidth: 2,
          gapWidth: 2,
        },
        levels: [
          {
            itemStyle: { borderWidth: 0, gapWidth: 4 },
            upperLabel: { show: false },
          },
          {
            colorSaturation: [0.3, 0.6],
            itemStyle: { borderWidth: 2, gapWidth: 2, borderColor: p.app },
          },
        ],
      },
    ],
  };

  return (
    <ReactECharts option={option} style={{ height: 600, width: "100%" }} />
  );
}
