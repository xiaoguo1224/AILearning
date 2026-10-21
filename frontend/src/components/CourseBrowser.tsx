"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Cell, Empty, Flex, Grid, Search, Selector, Space, Tag, Typography } from "react-vant";
import { DeleteCourseButton } from "@/components/DeleteCourseButton";
import type { CourseSummary } from "@/lib/types";

export type CourseSort = "frequent" | "newest" | "initial";

const COVERS = [
  "linear-gradient(125deg, #188e58, #225b49)", "linear-gradient(125deg, #2c78bf, #384c87)",
  "linear-gradient(125deg, #7a60b8, #4e447d)", "linear-gradient(125deg, #b77a30, #81592f)",
  "linear-gradient(125deg, #ae5b80, #754263)", "linear-gradient(125deg, #268c99, #285c71)",
];

export function CourseBrowser({ courses, initialQuery = "", initialSort = "frequent" }: {
  courses: CourseSummary[]; initialQuery?: string; initialSort?: CourseSort;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<CourseSort>(initialSort);
  const matched = courses.filter(course => `${course.title}\n${course.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (sort === "frequent") matched.sort((a, b) => (b.open_count ?? 0) - (a.open_count ?? 0));
  if (sort === "initial") matched.sort((a, b) => a.title.localeCompare(b.title, "zh-CN", { sensitivity: "base", numeric: true }));

  function updateUrl(search: string, order: CourseSort) {
    const params = new URLSearchParams({ sort: order });
    if (search.trim()) params.set("q", search.trim());
    window.history.replaceState(null, "", `/courses?${params}`);
  }

  return <Space direction="vertical" block gap={24}>
    <Cell.Group card style={{ padding: "16px 20px", boxShadow: "var(--sf-shadow-raise)" }}>
      <Flex wrap="wrap" gutter={20} align="center">
        <Flex.Item style={{ flex: "2 1 320px" }}>
          <Search value={query} onChange={value => { setQuery(value); updateUrl(value, sort); }} maxLength={200}
            shape="round" background="transparent" placeholder="搜索课程名称或简介" clearable
            onSearch={value => updateUrl(value, sort)} />
        </Flex.Item>
        <Flex.Item style={{ flex: "1 1 300px" }}>
          <Selector<CourseSort> columns={3} value={[sort]} options={[
        { label: "创建时间", value: "newest" }, { label: "常使用", value: "frequent" }, { label: "首字符", value: "initial" },
          ]} onChange={values => { if (values[0]) { setSort(values[0]); updateUrl(query, values[0]); } }} />
        </Flex.Item>
      </Flex>
    </Cell.Group>
    <Typography.Text type="secondary">共 {matched.length} 门课程</Typography.Text>
    {!matched.length ? <Empty description="未找到匹配课程，请调整搜索词。" /> :
      <Grid columnNum={3} border={false} center={false} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 24 }}>
        {matched.map(course => <Grid.Item key={course.id} contentStyle={{ padding: 0, background: "transparent" }}>
          <Cell.Group card style={{ margin: 0, width: "100%", overflow: "hidden", boxShadow: "var(--sf-shadow-raise)", border: "1px solid var(--sf-line)", borderRadius: 16 }}>
            <Cell border={false} style={{ minHeight: 156, padding: 24, background: COVERS[Math.abs(course.id) % COVERS.length], alignItems: "center" }}
              title={<Typography.Title level={2} style={{ margin: 0, fontSize: 20, lineHeight: 1.5, fontWeight: 600 }}>
                <Typography.Link href={`/courses/${course.id}`} style={{ color: "#fff", fontSize: 20, fontWeight: 600, lineHeight: 1.5 }}>{course.title}</Typography.Link>
              </Typography.Title>} />
            <Cell border={false} style={{ minHeight: 78, padding: "18px 20px 8px" }}
              title={<Typography.Text type="secondary" ellipsis={2} style={{ fontSize: 14, lineHeight: 1.6 }}>{course.description || "课程章节、知识讲解与实践练习"}</Typography.Text>} />
            <Cell border={false} style={{ padding: "0 20px 14px" }} title={<Tag plain round color="var(--sf-accent)">已打开 {course.open_count ?? 0} 次</Tag>} />
            <Cell border={false} style={{ padding: "0 20px 20px" }}><Space wrap><Button size="small" type="primary" round onClick={() => router.push(`/courses/${course.id}`)}>进入学习</Button>
              <DeleteCourseButton courseId={course.id} title={course.title} /></Space></Cell>
          </Cell.Group>
        </Grid.Item>)}
      </Grid>}
  </Space>;
}
