"use client";

import { Button, Cell, Empty, NoticeBar, Space, Typography } from "react-vant";
import { useI18n } from "@/components/LocaleProvider";
import { CourseBrowser, type CourseSort } from "@/components/CourseBrowser";
import type { CourseSummary } from "@/lib/types";

export function CourseListView({ courses, error, query, sort }: {
  courses: CourseSummary[]; error: string | null; query: string; sort: CourseSort;
}) {
  const { t } = useI18n();
  return <Space direction="vertical" block gap={28} style={{ maxWidth: 1240, margin: "0 auto", padding: "40px 28px", width: "100%", background: "var(--sf-app)" }}>
    <Cell border={false} style={{ padding: 0, background: "transparent", alignItems: "center" }} title={<Typography.Title level={1} style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 700 }}>{t("My courses")}</Typography.Title>}
      label={t("Turn any material into a structured course with quizzes.")}
      extra={courses.length > 0 && <Button id="new-course" tag="a" {...{ href: "/courses/new" }} type="primary">{t("New course")}</Button>} />
    {error ? <NoticeBar text={error} scrollable={false} wrapable color="var(--danger)" /> :
      !courses.length ? <Empty description={t("No courses yet")}>
        <Typography.Text>{t("Paste text, drop in a URL, or upload a PDF to get started.")}</Typography.Text>
        <Button id="create-first-course" tag="a" {...{ href: "/courses/new" }} type="primary">{t("Create your first course")}</Button>
      </Empty> : <CourseBrowser courses={courses} initialQuery={query} initialSort={sort} />}
  </Space>;
}
