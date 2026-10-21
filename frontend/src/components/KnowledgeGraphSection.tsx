"use client";

import { Cell, Selector, Typography } from "react-vant";
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

  return <Cell.Group title="学习顺序图" card>
    <Cell><Selector<"graph" | "list"> columns={2} value={[view]} options={[
      { label: "图谱", value: "graph" }, { label: "列表", value: "list" },
    ]} onChange={values => { if (values[0]) setView(values[0]); }} /></Cell>
    {view === "graph" ? <ProjectCourseGraph curriculum={curriculum} projectId={projectId}
      onNodeClick={courseId => router.push(`/courses/${courseId}`)} /> :
      <Cell><Typography.Text type="secondary">课程与章节列表见下方。</Typography.Text></Cell>}
  </Cell.Group>;
}
