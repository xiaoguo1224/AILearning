"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input, Segmented } from "antd";

import { CourseDeletionProvider, DeleteCourseButton } from "@/components/DeleteCourseButton";
import type { CourseSummary } from "@/lib/types";

const COVERS = [
  "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
  "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
  "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
  "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)",
  "linear-gradient(135deg, #fb7185 0%, #e11d48 100%)",
  "linear-gradient(135deg, #94a3b8 0%, #475569 100%)",
];

function coverFor(course: CourseSummary): string {
  return COVERS[Math.abs(course.id) % COVERS.length];
}

type SortKey = "created" | "frequent" | "alpha";

export function CourseList({ courses }: { courses: CourseSummary[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("frequent");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? courses.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (c.description || "").toLowerCase().includes(q),
        )
      : [...courses];
    switch (sort) {
      case "frequent":
        list.sort((a, b) => (b.opened_count || 0) - (a.opened_count || 0));
        break;
      case "alpha":
        list.sort((a, b) => a.title.localeCompare(b.title, "zh"));
        break;
      case "created":
      default:
        break;
    }
    return list;
  }, [courses, query, sort]);

  return (
    <CourseDeletionProvider>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 24,
          padding: "12px 16px",
          background: "var(--sf-surface)",
          borderRadius: 12,
        }}
      >
        <Input.Search
          placeholder="搜索课程名称或简介"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          allowClear
          style={{ flex: "1 1 220px" }}
        />
        <Segmented
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { label: "创建时间", value: "created" },
            { label: "常使用", value: "frequent" },
            { label: "首字符", value: "alpha" },
          ]}
        />
      </div>

      <p style={{ marginTop: 16, color: "var(--sf-ink-muted)", fontSize: 13 }}>
        共 {filtered.length} 门课程
      </p>

      <ul
        style={{
          marginTop: 16,
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
        }}
      >
        {filtered.map((course) => (
          <li key={course.id} style={{ minWidth: 0 }}>
            <article
              className="course-card"
              style={{
                overflow: "hidden",
                borderRadius: 20,
                background: "var(--sf-surface)",
                border: "1px solid var(--sf-line)",
                boxShadow: "var(--sf-shadow-raise)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "var(--sf-shadow-overlay)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "var(--sf-shadow-raise)";
              }}
            >
              <Link href={`/courses/${course.id}`} style={{ display: "block" }}>
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "16/8",
                    background: coverFor(course),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 28,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%)",
                    }}
                  />
                  <span
                    style={{
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 18,
                      textAlign: "center",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {course.title}
                  </span>
                </div>
                <div style={{ padding: "16px 16px 8px" }}>
                  <p
                    style={{
                      color: "var(--sf-ink-muted)",
                      fontSize: 13,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      minHeight: 36,
                      margin: 0,
                    }}
                  >
                    {course.description || "课程章节、知识讲解与实践练习"}
                  </p>
                </div>
              </Link>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px 16px",
                  borderTop: "1px solid var(--sf-line)",
                  marginTop: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link
                    href={`/courses/${course.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "7px 20px",
                      borderRadius: 20,
                      background: "var(--sf-accent)",
                      color: "var(--sf-on-fill)",
                      fontSize: 13,
                      fontWeight: 500,
                      transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    进入学习
                  </Link>
                  {(course.opened_count || 0) > 0 && (
                    <span style={{ fontSize: 12, color: "var(--sf-ink-muted)" }}>
                      已学 {course.opened_count} 次
                    </span>
                  )}
                </div>
                <DeleteCourseButton courseId={course.id} title={course.title} />
              </div>
            </article>
          </li>
        ))}
      </ul>
    </CourseDeletionProvider>
  );
}
