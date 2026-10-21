"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { ConceptLesson, ConceptNode, MasteryBucket } from "@/lib/types";

interface ConceptStatsProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
}

const MASTERY_COLORS: Record<MasteryBucket, string> = {
  mastered: "#1fae54",
  solid: "#7dd3a8",
  shaky: "#f5a623",
  not_started: "#e0e0e0",
};

const MASTERY_LABELS: Record<MasteryBucket, string> = {
  mastered: "已掌握",
  solid: "较稳固",
  shaky: "不稳固",
  not_started: "尚未开始",
};

const BUCKETS: MasteryBucket[] = ["mastered", "solid", "shaky", "not_started"];

/**
 * Course concept statistics: stacked bars per lesson + overall mastery donut.
 * Clean ECharts visualizations replacing the hand-written SVG concept map.
 */
export function ConceptStats({ lessons, concepts }: ConceptStatsProps) {
  const barOption = useMemo(() => {
    const byLesson = new Map<number, Map<MasteryBucket, number>>();
    for (const c of concepts) {
      let m = byLesson.get(c.lesson_index);
      if (!m) {
        m = new Map();
        byLesson.set(c.lesson_index, m);
      }
      m.set(c.bucket, (m.get(c.bucket) ?? 0) + 1);
    }
    const xLabels = lessons.map((l) => l.title);
    const series = BUCKETS.map((b) => ({
      name: MASTERY_LABELS[b],
      type: "bar",
      stack: "total",
      itemStyle: { color: MASTERY_COLORS[b] },
      data: lessons.map((l) => byLesson.get(l.index)?.get(b) ?? 0),
    }));
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: BUCKETS.map((b) => MASTERY_LABELS[b]) },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLabel: { interval: 0, rotate: 20, fontSize: 11 },
      },
      yAxis: { type: "value", name: "知识点数" },
      series,
    };
  }, [lessons, concepts]);

  const donutOption = useMemo(() => {
    const counts = new Map<MasteryBucket, number>();
    for (const c of concepts) {
      counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
    }
    return {
      tooltip: { trigger: "item" },
      legend: { bottom: 0 },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: "#fff", borderWidth: 2 },
          label: { show: true, formatter: "{b}\n{d}%" },
          data: BUCKETS.map((b) => ({
            name: MASTERY_LABELS[b],
            value: counts.get(b) ?? 0,
            itemStyle: { color: MASTERY_COLORS[b] },
          })),
        },
      ],
    };
  }, [concepts]);

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 480px", minWidth: 0 }}>
        <ReactECharts option={barOption} style={{ height: 420, width: "100%" }} />
      </div>
      <div style={{ flex: "1 1 280px", minWidth: 0 }}>
        <ReactECharts option={donutOption} style={{ height: 420, width: "100%" }} />
      </div>
    </div>
  );
}

export function MasteryLegend() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
      {BUCKETS.map((key) => (
        <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: MASTERY_COLORS[key],
              display: "inline-block",
            }}
          />
          {MASTERY_LABELS[key]}
        </span>
      ))}
    </div>
  );
}
