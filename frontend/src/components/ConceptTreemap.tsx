"use client";

import ReactECharts from "echarts-for-react";

import type { ConceptLesson, ConceptNode } from "@/lib/types";

interface ConceptTreemapProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
}

const BUCKET_COLORS: Record<string, string> = {
  mastered: "#10b981",
  solid: "#6ee7b7",
  shaky: "#fbbf24",
  not_started: "#e5e7eb",
};

const BUCKET_TEXT_COLORS: Record<string, string> = {
  mastered: "#ffffff",
  solid: "#065f46",
  shaky: "#92400e",
  not_started: "#6b7280",
};

// Diverse palette for not_started concepts, varied by lesson index.
const LESSON_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" }, // blue
  { bg: "#e0e7ff", text: "#3730a3" }, // indigo
  { bg: "#ede9fe", text: "#5b21b6" }, // violet
  { bg: "#fce7f3", text: "#9d174d" }, // pink
  { bg: "#ffedd5", text: "#9a3412" }, // orange
  { bg: "#fef3c7", text: "#92400e" }, // amber
  { bg: "#d1fae5", text: "#065f46" }, // emerald
  { bg: "#ccfbf1", text: "#115e59" }, // teal
  { bg: "#e0f2fe", text: "#0c4a6e" }, // sky
  { bg: "#f3e8ff", text: "#6b21a8" }, // purple
];

/**
 * Treemap of AI-extracted concepts sized by importance (1-5).
 * Groups concepts by their introducing lesson.
 */
export function ConceptTreemap({ lessons, concepts }: ConceptTreemapProps) {
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
        let bg = BUCKET_COLORS[n.bucket] ?? "#e5e7eb";
        let textColor = BUCKET_TEXT_COLORS[n.bucket] ?? "#6b7280";
        if (n.bucket === "not_started") {
          const palette = LESSON_PALETTE[lessonIndex % LESSON_PALETTE.length];
          bg = palette.bg;
          textColor = palette.text;
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
      formatter: (info: { name: string; value: number }) =>
        `${info.name}<br/>重要程度: ${info.value}/5`,
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
          color: "#fff",
          backgroundColor: "#059669",
          fontSize: 13,
          fontWeight: 500,
        },
        itemStyle: {
          borderColor: "#fff",
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
            itemStyle: { borderWidth: 2, gapWidth: 2, borderColor: "#fff" },
          },
        ],
      },
    ],
  };

  return (
    <ReactECharts option={option} style={{ height: 600, width: "100%" }} />
  );
}
