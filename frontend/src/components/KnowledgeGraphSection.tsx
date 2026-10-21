"use client";

import { Card, Segmented } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import type { KnowledgeList } from "@/lib/types";

interface KnowledgeGraphSectionProps {
  knowledge: KnowledgeList;
  projectId: number;
}

/**
 * Toggle between list and ECharts graph view of the knowledge base.
 */
export function KnowledgeGraphSection({ knowledge, projectId }: KnowledgeGraphSectionProps) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const router = useRouter();

  return (
    <Card
      title="Knowledge Graph"
      extra={
        <Segmented
          value={view}
          onChange={(v) => setView(v as "graph" | "list")}
          options={[
            { label: "Graph", value: "graph" },
            { label: "List", value: "list" },
          ]}
        />
      }
      style={{ marginBottom: 24 }}
    >
      {view === "graph" ? (
        <KnowledgeGraph
          knowledge={knowledge}
          onNodeClick={(id) => {
            router.push(`/projects/${projectId}/knowledge?entry=${id}`);
          }}
        />
      ) : (
        <p style={{ color: '#888' }}>List view is shown below.</p>
      )}
    </Card>
  );
}
