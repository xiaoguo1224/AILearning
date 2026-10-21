"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { ConceptLesson, ConceptNode, MasteryBucket } from "@/lib/types";

interface ConceptMapProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
  onSelect?: (conceptKey: string) => void;
}

const MASTERY_COLORS: Record<MasteryBucket, string> = {
  mastered: "#1fae54",
  solid: "#7dd3a8",
  shaky: "#f5a623",
  not_started: "#e0e0e0",
};

/**
 * ECharts-based concept map: one column per lesson, concepts as nodes.
 * Replaces the hand-written SVG version.
 */
export function ConceptMap({ lessons, concepts, onSelect }: ConceptMapProps) {
  const option = useMemo(() => {
    const data: any[] = [];
    const xLabels: string[] = lessons.map((l) => l.title);

    // Group concepts by lesson_index.
    const byLesson = new Map<number, ConceptNode[]>();
    for (const c of concepts) {
      const arr = byLesson.get(c.lesson_index) ?? [];
      arr.push(c);
      byLesson.set(c.lesson_index, arr);
    }

    lessons.forEach((lesson, lessonIdx) => {
      const lessonConcepts = byLesson.get(lesson.index) ?? [];
      lessonConcepts.forEach((concept, conceptIdx) => {
        data.push({
          value: [lessonIdx, -conceptIdx],
          name: concept.concept_label,
          conceptKey: concept.concept_key,
          itemStyle: {
            color: MASTERY_COLORS[concept.bucket],
            borderColor: "#fff",
            borderWidth: 2,
          },
          symbolSize: 20 + (concept.occurrences || 1) * 8,
        });
      });
    });

    return {
      tooltip: {
        formatter: (params: any) => params.name,
      },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLabel: { rotate: 30, interval: 0 },
      },
      yAxis: {
        type: "value",
        show: false,
      },
      series: [
        {
          type: "scatter",
          data,
          label: {
            show: true,
            formatter: "{b}",
            position: "bottom",
            fontSize: 11,
          },
        },
      ],
    };
  }, [lessons]);

  return (
    <ReactECharts
      option={option}
      style={{ height: 500, width: "100%" }}
      onEvents={{
        click: (params: any) => {
          if (params.data?.conceptKey && onSelect) {
            onSelect(params.data.conceptKey);
          }
        },
      }}
    />
  );
}

export function MasteryLegend() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
      {Object.entries({
        mastered: "已掌握",
        solid: "较稳固",
        shaky: "不稳固，即将复习",
        not_started: "尚未开始",
      }).map(([key, label]) => (
        <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: MASTERY_COLORS[key as MasteryBucket],
              display: "inline-block",
            }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
