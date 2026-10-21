"use client";

import { Button, Cell, NoticeBar, Space } from "react-vant";
import ReactECharts from "echarts-for-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { useJob } from "@/components/JobProgress";
import { getProjectGraph, listJobs, startGraphExtractJob, type ProjectGraph } from "@/lib/api";
import type { ProjectCurriculum } from "@/lib/types";

interface ProjectCourseGraphProps {
  curriculum: ProjectCurriculum;
  projectId: number;
  onNodeClick?: (courseId: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  contains: "包含", course_sequence: "课程顺序", chapter_sequence: "章节顺序", prerequisite: "前置", related: "相关",
};

/** Reserve a separate lane per course and a cell per chapter, independent of AI edge coverage. */
export function buildCourseGraph(curriculum: ProjectCurriculum, graph: ProjectGraph | null) {
  const nodes: { id: string; name: string; value: number; courseId: number; category: number; symbolSize: number; x: number; y: number }[] = [];
  const links: { source: string; target: string; lineStyle?: { color: string; type?: string }; label?: { show: boolean; formatter: string }; tooltip?: { formatter: string } }[] = [];
  const courses = [...curriculum.courses].sort((a, b) =>
    (graph?.positions[`course-${a.id}`]?.x ?? curriculum.courses.indexOf(a) * 100) -
    (graph?.positions[`course-${b.id}`]?.x ?? curriculum.courses.indexOf(b) * 100));
  let maxRows = 1;
  courses.forEach((course, ci) => {
    const cid = `course-${course.id}`;
    nodes.push({ id: cid, name: course.title, value: course.id, courseId: course.id,
      category: ci, symbolSize: 60, x: ci * 740 + 160, y: 0 });
    const lessons = course.modules.flatMap(module => module.lessons);
    maxRows = Math.max(maxRows, Math.ceil(lessons.length / 2));
    lessons.forEach((lesson, li) => {
      const lid = `lesson-${lesson.id}`;
      nodes.push({ id: lid, name: lesson.title, value: lesson.id, courseId: course.id,
        category: ci, symbolSize: 30, x: ci * 740 + (li % 2) * 320, y: 180 + Math.floor(li / 2) * 150 });
      links.push({ source: cid, target: lid, lineStyle: { color: "#c4c4c4", type: "dashed" } });
      if (li) links.push({ source: `lesson-${lessons[li - 1].id}`, target: lid,
        lineStyle: { color: "#52a768" }, label: { show: false, formatter: "章节顺序" } });
    });
  });
  const ids = new Set(nodes.map(node => node.id));
  const seen = new Set(links.map(link => `${link.source}|${link.target}|${link.label?.formatter ?? "包含"}`));
  for (const edge of graph?.edges ?? []) {
    const source = `${edge.from_type}-${edge.from_id}`, target = `${edge.to_type}-${edge.to_id}`;
    const label = KIND_LABELS[edge.kind] ?? edge.kind;
    const key = `${source}|${target}|${label}`;
    if (!ids.has(source) || !ids.has(target) || seen.has(key)) continue;
    seen.add(key);
    links.push({ source, target, lineStyle: { color: edge.kind === "prerequisite" ? "#df4f4f" : "#3388c8" },
      label: { show: true, formatter: label }, tooltip: { formatter: edge.reason } });
  }
  return { nodes, links, categories: courses.map(course => ({ name: course.title })),
    width: Math.max(1000, courses.length * 740 + 160), height: Math.max(650, maxRows * 150 + 300) };
}

export function ProjectCourseGraph({ curriculum, projectId, onNodeClick }: ProjectCourseGraphProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);
  const extracting = starting || (!!jobId && (!job || ["pending", "running"].includes(job.status)));

  useEffect(() => {
    let cancelled = false;
    getProjectGraph(projectId).then(value => { if (!cancelled) setGraph(value); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "图谱加载失败"); });
    listJobs(undefined, 100).then(({ items }) => {
      const active = items.find(item => item.type === "project_graph_extract" && item.ref_id === projectId && ["pending", "running"].includes(item.status));
      if (!cancelled && active) setJobId(active.id);
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "任务恢复失败"); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (job?.status !== "completed") return;
    let cancelled = false;
    getProjectGraph(projectId).then(value => { if (!cancelled) setGraph(value); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "图谱刷新失败"); });
    return () => { cancelled = true; };
  }, [job?.status, projectId]);

  const layout = useMemo(() => buildCourseGraph(curriculum, graph), [curriculum, graph]);
  const option = useMemo(() => ({
    tooltip: { renderMode: "richText" },
    legend: { data: layout.categories.map(category => category.name), type: "scroll" },
    series: [{ type: "graph", layout: "none", data: layout.nodes, links: layout.links, categories: layout.categories,
      left: 70, top: 100, right: 210, bottom: 80, roam: true, scaleLimit: { min: 0.25, max: 3 },
      label: { show: true, position: "right", fontSize: 13, width: 230, overflow: "truncate", formatter: "{b}" },
      lineStyle: { color: "source", curveness: 0.1 },
      emphasis: { focus: "adjacency", lineStyle: { width: 3 } }, edgeSymbol: ["none", "arrow"], edgeSymbolSize: 7 }],
  }), [layout]);

  return <Space direction="vertical" block>
    <Cell.Group>
      <Cell title={`课程 ${curriculum.courses.length} 个 · 章节 ${layout.nodes.length - curriculum.courses.length} 个`} label="可横向滚动、拖动和缩放；点击章节进入学习。" />
      <Cell>
      <Button loading={extracting} disabled={extracting} onClick={async () => {
        setStarting(true); setError(null);
        try { const result = await startGraphExtractJob(projectId); setJobId(result.job_id); }
        catch (err) { setError(err instanceof Error ? err.message : "提取失败"); }
        finally { setStarting(false); }
      }}>{t("Re-extract with AI")}</Button>
      </Cell>
    </Cell.Group>
    {(error || pollError || job?.error) && <NoticeBar color="var(--danger)" text={error || pollError || job?.error} scrollable={false} wrapable />}
    <Cell.Group className="course-graph-canvas" style={{ overflowX: "auto" }}>
      <ReactECharts option={option} notMerge style={{ height: layout.height, width: layout.width }} onEvents={{
        click: (params: { dataType?: string; data?: { id?: string; value?: number; courseId?: number } }) => {
          if (params.dataType !== "node") return;
          const node = params.data;
          if (node?.id?.startsWith("course-") && node.value) onNodeClick?.(node.value);
          if (node?.id?.startsWith("lesson-") && node.value && node.courseId)
            router.push(`/courses/${node.courseId}/lessons/${node.value}`);
        },
      }} />
    </Cell.Group>
  </Space>;
}
