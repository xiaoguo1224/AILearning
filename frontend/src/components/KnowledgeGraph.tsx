"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { KnowledgeList } from "@/lib/types";

interface KnowledgeGraphProps {
  knowledge: KnowledgeList;
  onNodeClick?: (id: number) => void;
}

/**
 * ECharts force-directed knowledge graph.
 * Nodes are knowledge entries, edges are prerequisite/related/extends relations.
 */
export function KnowledgeGraph({ knowledge, onNodeClick }: KnowledgeGraphProps) {
  const option = useMemo(() => {
    const items = knowledge.items ?? [];
    const nodes = items.map((e) => ({
      id: String(e.id),
      name: e.title,
      value: e.id,
      category: e.status,
      symbolSize: 40,
    }));

    // Relations are on KnowledgeDetail; the list view shows nodes only.
    // Edges are added when the detail API provides them.
    const links: { source: string; target: string }[] = [];

    return {
      tooltip: {},
      legend: [{ data: ["draft", "pending_review", "confirmed"] }],
      series: [
        {
          type: "graph",
          layout: "force",
          data: nodes,
          links,
          categories: [
            { name: "draft" },
            { name: "pending_review" },
            { name: "confirmed" },
          ],
          roam: true,
          label: { show: true, position: "right" },
          force: { repulsion: 200, edgeLength: 120 },
          emphasis: { focus: "adjacency", lineStyle: { width: 4 } },
        },
      ],
    };
  }, [knowledge]);

  return (
    <ReactECharts
      option={option}
      style={{ height: 600, width: "100%" }}
      onEvents={{
        click: (params: { data?: { value?: number } }) => {
          if (params.data?.value && onNodeClick) {
            onNodeClick(params.data.value);
          }
        },
      }}
    />
  );
}
