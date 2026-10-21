"use client";

import { Button } from "antd";
import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import {
  getJob,
  getProjectGraph,
  listJobs,
  startGraphExtractJob,
  type ProjectGraph,
  type ProjectGraphEdge,
} from "@/lib/api";
import type { ProjectCurriculum } from "@/lib/types";

interface ProjectCourseGraphProps {
  curriculum: ProjectCurriculum;
  projectId: number;
  onNodeClick?: (courseId: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  contains: "包含",
  course_sequence: "课程顺序",
  chapter_sequence: "章节顺序",
  prerequisite: "前置",
  related: "相关",
};

const KIND_STYLES: Record<string, { color: string; width: number; type?: string }> = {
  contains: { color: "#d9d9d9", width: 1, type: "dashed" },
  course_sequence: { color: "#1fae54", width: 3 },
  chapter_sequence: { color: "#52c41a", width: 2 },
  prerequisite: { color: "#f5222d", width: 2 },
  related: { color: "#1890ff", width: 1, type: "dashed" },
};

/**
 * Project learning graph with AI-extracted relationships.
 * Edges come from the backend AI extraction; falls back to teaching
 * sequence when no AI edges exist yet. Re-extract on demand.
 */
export function ProjectCourseGraph({ curriculum, projectId, onNodeClick }: ProjectCourseGraphProps) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const edges = graph?.edges ?? null;
  const positions = graph?.positions ?? {};
  const [extracting, setExtracting] = useState(false);

  // On mount, check if an extraction is already running (survives refresh).
  useEffect(() => {
    let cancelled = false;
    listJobs()
      .then(({ items }) => {
        if (cancelled) return;
        const running = items.find(
          (j) =>
            j.type === "project_graph_extract" &&
            (j.status === "pending" || j.status === "running") &&
            j.ref_id === projectId,
        );
        if (running) {
          setExtracting(true);
          void pollJob(running.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const [extractError, setExtractError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectGraph(projectId)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        if (!cancelled) setGraph({ edges: [], positions: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function pollJob(jobId: string) {
    for (let i = 0; i < 120; i++) {
      const job = await getJob(jobId);
      if (job.status === "completed") {
        setGraph(await getProjectGraph(projectId));
        break;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        setExtractError(job.error || "提取失败");
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setExtracting(false);
  }

  async function reExtract() {
    if (extracting) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const { job_id } = await startGraphExtractJob(projectId);
      await pollJob(job_id);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "提取失败");
      setExtracting(false);
    }
  }

  const option = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeIds = new Set<string>();
    const categories = curriculum.courses.map((c) => ({ name: c.title }));

    // All courses and lessons as nodes. Each course is its own category so the
    // legend lists course names; lessons take their parent course's category.
    // When AI positions exist, use them with layout 'none'. Otherwise, compute
    // a simple layered fallback so nodes don't all pile up at the center.
    const hasPositions = Object.keys(positions).length > 0;
    const courseCount = curriculum.courses.length;
    curriculum.courses.forEach((course, courseIdx) => {
      const cid = `course-${course.id}`;
      nodeIds.add(cid);
      const cpos = positions[cid];
      // Course positions from AI (course-level only). Chapters are laid out
      // under their course.
      let cx: number | undefined, cy: number | undefined;
      if (cpos) {
        cx = cpos.x * 20; cy = cpos.y * 20;
      } else if (!hasPositions) {
        cx = 150 + (courseCount > 1 ? (courseIdx * 900) / (courseCount - 1) : 450);
        cy = 150;
      }
      nodes.push({
        id: cid,
        name: course.title,
        value: course.id,
        category: courseIdx,
        symbolSize: 64,
        ...(cx !== undefined ? { x: cx, y: cy } : {}),
      });
      // Chapter nodes: arranged in a circle around their course.
      const allLessons = course.modules.flatMap((m) => m.lessons);
      allLessons.forEach((l, lessonIdx) => {
        {
          const lid = `lesson-${l.id}`;
          nodeIds.add(lid);
          let lx: number | undefined, ly: number | undefined;
          if (cx !== undefined && cy !== undefined) {
            // Circular arrangement around the course.
            const n = allLessons.length;
            const radius = 90 + Math.floor(lessonIdx / 8) * 55;
            const angle = (lessonIdx % 8) * ((2 * Math.PI) / Math.min(8, n)) - Math.PI / 2;
            lx = cx + radius * Math.cos(angle);
            ly = cy + radius * Math.sin(angle);
          }
          nodes.push({
            id: lid,
            name: l.title,
            value: l.id,
            category: courseIdx,
            symbolSize: 28,
            ...(lx !== undefined ? { x: lx, y: ly } : {}),
          });
          // Containment edge: course -> chapter.
          links.push({
            source: cid,
            target: lid,
            lineStyle: { color: "#d9d9d9", width: 1, type: "dashed" },
          });
          // Sequential edge between chapters in the same course.
          if (lessonIdx > 0) {
            const prevLid = `lesson-${course.modules.flatMap((mm) => mm.lessons)[lessonIdx - 1].id}`;
            links.push({
              source: prevLid,
              target: lid,
              lineStyle: { color: "#52c41a", width: 2 },
            });
          }
        }
      });
    });

    // AI edges; fall back to teaching sequence if none.
    if (edges && edges.length > 0) {
      links.push(
        ...edges
          .filter(
          (e) =>
            nodeIds.has(`${e.from_type}-${e.from_id}`) &&
            nodeIds.has(`${e.to_type}-${e.to_id}`),
        )
        .map((e) => {
          const style = KIND_STYLES[e.kind] ?? { color: "#999", width: 2 };
          return {
            source: `${e.from_type}-${e.from_id}`,
            target: `${e.to_type}-${e.to_id}`,
            label: {
              show: e.kind !== "contains",
              formatter: KIND_LABELS[e.kind] ?? e.kind,
              fontSize: 10,
            },
            lineStyle: {
              color: style.color,
              width: style.width,
              type: style.type ?? "solid",
            },
            // Containment edges point inward without arrowheads.
            edgeSymbol: e.kind === "contains" ? ["none", "none"] : ["none", "arrow"],
            tooltip: { formatter: e.reason },
          };
        }),
      );
    } else {
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
      legend: { data: categories.map((c) => c.name) },
      series: [
        {
          type: "graph",
          layout: "none",
          data: nodes,
          links,
          categories,
          roam: true,
          labelLayout: {
            hideOverlap: true,
          },
          scaleLimit: {
            min: 0.4,
            max: 2,
          },
          label: {
            show: true,
            position: "right",
            formatter: "{b}",
            fontSize: 11,
          },
          lineStyle: {
            color: "source",
            curveness: 0.3,
          },
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
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {extractError && (
          <span style={{ color: "#f5222d", fontSize: 12 }}>{extractError}</span>
        )}
        <Button loading={extracting} disabled={extracting} onClick={() => void reExtract()}>
          {t("Re-extract with AI")}
        </Button>
      </div>
      {edges && edges.length === 0 && (
        <p style={{ color: "#888", marginBottom: 12 }}>
          暂无 AI 提炼的关系，显示教学顺序。点击上方按钮用 AI 提炼。
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1600 }}>
          <ReactECharts
            option={option}
            style={{ height: 900, width: "100%" }}
            onEvents={{
              click: (params: { data?: { id?: string; value?: number } }) => {
                const id = params.data?.id ?? "";
                if (id.startsWith("course-") && params.data?.value && onNodeClick) {
                  onNodeClick(params.data.value);
                }
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
