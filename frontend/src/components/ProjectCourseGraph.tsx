"use client";

import { Button } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import {
  getJob,
  getProjectGraph,
  startGraphExtractJob,
  type ProjectGraphEdge,
} from "@/lib/api";
import type { ProjectCurriculum } from "@/lib/types";

interface ProjectCourseGraphProps {
  curriculum: ProjectCurriculum;
  projectId: number;
  onNodeClick?: (courseId: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  prerequisite: "前置",
  related: "相关",
  sequence: "顺序",
};

const KIND_COLORS: Record<string, string> = {
  prerequisite: "#f5222d",
  related: "#1890ff",
  sequence: "#52c41a",
};

/**
 * Project learning graph with AI-extracted relationships.
 * Edges come from the backend AI extraction; falls back to teaching
 * sequence when no AI edges exist yet. Re-extract on demand.
 */
export function ProjectCourseGraph({ curriculum, projectId, onNodeClick }: ProjectCourseGraphProps) {
  const { t } = useI18n();
  const [edges, setEdges] = useState<ProjectGraphEdge[] | null>(null);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectGraph(projectId)
      .then((e) => {
        if (!cancelled) setEdges(e);
      })
      .catch(() => {
        if (!cancelled) setEdges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function reExtract() {
    setExtracting(true);
    try {
      const { job_id } = await startGraphExtractJob(projectId);
      for (let i = 0; i < 60; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") {
          setEdges(await getProjectGraph(projectId));
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    } finally {
      setExtracting(false);
    }
  }

  const option = useMemo(() => {
    const nodes: any[] = [];
    const nodeIds = new Set<string>();

    // All courses and lessons as nodes.
    curriculum.courses.forEach((course) => {
      const cid = `course-${course.id}`;
      nodeIds.add(cid);
      nodes.push({
        id: cid,
        name: course.title,
        value: course.id,
        category: 0,
        symbolSize: 56,
      });
      for (const m of course.modules) {
        for (const l of m.lessons) {
          const lid = `lesson-${l.id}`;
          nodeIds.add(lid);
          nodes.push({
            id: lid,
            name: l.title,
            value: l.id,
            category: 1,
            symbolSize: 32,
          });
        }
      }
    });

    // AI edges; fall back to teaching sequence if none.
    let links: any[];
    if (edges && edges.length > 0) {
      links = edges
        .filter(
          (e) =>
            nodeIds.has(`${e.from_type}-${e.from_id}`) &&
            nodeIds.has(`${e.to_type}-${e.to_id}`),
        )
        .map((e) => ({
          source: `${e.from_type}-${e.from_id}`,
          target: `${e.to_type}-${e.to_id}`,
          label: { show: true, formatter: KIND_LABELS[e.kind] ?? e.kind, fontSize: 10 },
          lineStyle: { color: KIND_COLORS[e.kind] ?? "#999", width: 2 },
          tooltip: { formatter: e.reason },
        }));
    } else {
      links = [];
      let prev: string | null = null;
      curriculum.courses.forEach((course) => {
        const cid = `course-${course.id}`;
        if (prev) links.push({ source: prev, target: cid });
        prev = cid;
        for (const m of course.modules) {
          for (const l of m.lessons) {
            const lid = `lesson-${l.id}`;
            links.push({ source: prev, target: lid });
            prev = lid;
          }
        }
      });
    }

    return {
      tooltip: {},
      legend: { data: ["课程", "章节"] },
      series: [
        {
          type: "graph",
          layout: "force",
          data: nodes,
          links,
          categories: [{ name: "课程" }, { name: "章节" }],
          roam: true,
          label: { show: true, position: "right", fontSize: 11 },
          force: { repulsion: 300, edgeLength: 140 },
          emphasis: { focus: "adjacency", lineStyle: { width: 4 } },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: 8,
        },
      ],
    };
  }, [curriculum, edges]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
        <Button loading={extracting} onClick={() => void reExtract()}>
          {t("Re-extract with AI")}
        </Button>
      </div>
      {edges && edges.length === 0 && (
        <p style={{ color: "#888", marginBottom: 12 }}>
          暂无 AI 提炼的关系，显示教学顺序。点击上方按钮用 AI 提炼。
        </p>
      )}
      <ReactECharts
        option={option}
        style={{ height: 600, width: "100%" }}
        onEvents={{
          click: (params: { data?: { value?: number; category?: number } }) => {
            if (params.data?.category === 0 && params.data?.value && onNodeClick) {
              onNodeClick(params.data.value);
            }
          },
        }}
      />
    </div>
  );
}
