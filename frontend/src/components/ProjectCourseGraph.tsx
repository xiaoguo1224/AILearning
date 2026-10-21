"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

import type { ProjectCurriculum } from "@/lib/types";

interface ProjectCourseGraphProps {
  curriculum: ProjectCurriculum;
  onNodeClick?: (courseId: number) => void;
}

/**
 * Project learning-order graph, derived automatically from the project's
 * courses and their chapters. Nodes are courses and chapters; edges follow
 * the teaching sequence, so the learner sees the cross-course learning
 * order without having to specify any relationships manually.
 */
export function ProjectCourseGraph({ curriculum, onNodeClick }: ProjectCourseGraphProps) {
  const option = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    let prevId: string | null = null;

    curriculum.courses.forEach((course, courseIdx) => {
      const courseNodeId = `course-${course.id}`;
      nodes.push({
        id: courseNodeId,
        name: course.title,
        value: course.id,
        category: 0,
        symbolSize: 56,
      });
      if (prevId) {
        links.push({ source: prevId, target: courseNodeId });
      }
      prevId = courseNodeId;

      // Chapters in teaching order within the course.
      const lessons: { id: number; title: string }[] = [];
      for (const m of course.modules) {
        for (const l of m.lessons) {
          lessons.push({ id: l.id, title: l.title });
        }
      }
      lessons.forEach((lesson) => {
        const lessonNodeId = `lesson-${lesson.id}`;
        nodes.push({
          id: lessonNodeId,
          name: lesson.title,
          value: lesson.id,
          category: 1,
          symbolSize: 32,
        });
        links.push({ source: prevId, target: lessonNodeId });
        prevId = lessonNodeId;
      });
    });

    return {
      tooltip: {
        formatter: (params: any) => params.name,
      },
      legend: {
        data: ["课程", "章节"],
      },
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
  }, [curriculum]);

  return (
    <ReactECharts
      option={option}
      style={{ height: 600, width: "100%" }}
      onEvents={{
        click: (params: { data?: { value?: number; category?: number } }) => {
          // Only course nodes navigate; chapter nodes carry lesson ids.
          if (params.data?.category === 0 && params.data?.value && onNodeClick) {
            onNodeClick(params.data.value);
          }
        },
      }}
    />
  );
}
