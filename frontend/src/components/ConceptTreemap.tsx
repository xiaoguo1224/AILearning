"use client";

import ReactECharts from "echarts-for-react";

import type { ConceptLesson, ConceptNode } from "@/lib/types";

interface ConceptTreemapProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
}

const BUCKET_COLORS: Record<string, string> = {
  mastered: "#1fae54",
  solid: "#7dd3a8",
  shaky: "#f5a623",
  not_started: "#e0e0e0",
};

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

  const data = Array.from(byLesson.entries()).map(([lessonId, nodes]) => {
    const lesson = lessonMap.get(lessonId);
    return {
      name: lesson?.title ?? `Lesson ${lessonId}`,
      children: nodes.map((n) => ({
        name: n.concept_label,
        // Importance 1-5 scaled for visible size differences.
        value: (n as ConceptNode & { importance?: number }).importance ?? 3,
        itemStyle: {
          color: BUCKET_COLORS[n.bucket] ?? "#e0e0e0",
        },
      })),
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
          height: 30,
          color: "#fff",
          backgroundColor: "#1fae54",
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
