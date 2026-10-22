"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { ConceptLesson, ConceptNode, MasteryBucket } from "@/lib/types";
import { useTheme } from "./ThemeProvider";
import { masteryColors, THEMES } from "@/lib/theme";

interface ConceptStatsProps {
  lessons: ConceptLesson[];
  concepts: ConceptNode[];
}

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
  const { theme } = useTheme();
  const p = THEMES[theme];
  const barOption = useMemo(() => {
    const colors = masteryColors(theme);
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
      itemStyle: { color: colors[b] },
      data: lessons.map((l) => byLesson.get(l.index)?.get(b) ?? 0),
    }));
    return {
      textStyle: { color: p.ink },
      tooltip: { trigger: "axis", renderMode: "richText", backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.ink }, axisPointer: { type: "shadow" } },
      legend: { textStyle: { color: p.muted }, data: BUCKETS.map((b) => MASTERY_LABELS[b]) },
      xAxis: {
        type: "category",
        data: xLabels,
        axisLabel: { interval: 0, rotate: 20, fontSize: 11, color: p.muted },
        axisLine: { lineStyle: { color: p.line } },
      },
      yAxis: { type: "value", name: "知识点数", axisLabel: { color: p.muted }, splitLine: { lineStyle: { color: p.line } } },
      series,
    };
  }, [lessons, concepts, theme, p]);

  const donutOption = useMemo(() => {
    const colors = masteryColors(theme);
    const counts = new Map<MasteryBucket, number>();
    for (const c of concepts) {
      counts.set(c.bucket, (counts.get(c.bucket) ?? 0) + 1);
    }
    return {
      textStyle: { color: p.ink },
      tooltip: { trigger: "item", renderMode: "richText", backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.ink } },
      legend: { bottom: 0, textStyle: { color: p.muted } },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: p.surface, borderWidth: 2 },
          label: { show: true, formatter: "{b}\n{d}%", color: p.ink },
          data: BUCKETS.map((b) => ({
            name: MASTERY_LABELS[b],
            value: counts.get(b) ?? 0,
            itemStyle: { color: colors[b] },
          })),
        },
      ],
    };
  }, [concepts, theme, p]);

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
  const { theme } = useTheme();
  const colors = masteryColors(theme);
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
      {BUCKETS.map((key) => (
        <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: colors[key],
              border: "1px solid var(--sf-line-strong)",
              display: "inline-block",
            }}
          />
          {MASTERY_LABELS[key]}
        </span>
      ))}
    </div>
  );
}
