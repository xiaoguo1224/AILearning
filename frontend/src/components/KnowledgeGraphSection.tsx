"use client";

import { Card, Segmented } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProjectCourseGraph } from "@/components/ProjectCourseGraph";
import type { ProjectCurriculum } from "@/lib/types";

interface KnowledgeGraphSectionProps {
  curriculum: ProjectCurriculum;
  projectId: number;
}

/**
 * Project knowledge graph: learning order derived automatically from the
 * project's courses and chapters. Toggle between graph and list views.
 */
export function KnowledgeGraphSection({ curriculum, projectId }: KnowledgeGraphSectionProps) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const router = useRouter();

  return (
    <Card
      title="学习顺序图"
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
        <>
          <p style={{ color: "#888", marginBottom: 12 }}>
            按课程与章节的教学顺序自动生成，无需手动指定关系。
          </p>
          <ProjectCourseGraph
            curriculum={curriculum}
            onNodeClick={(courseId) => {
              router.push(`/courses/${courseId}`);
            }}
          />
        </>
      ) : (
        <p style={{ color: "#888" }}>List view is shown below.</p>
      )}
    </Card>
  );
}
