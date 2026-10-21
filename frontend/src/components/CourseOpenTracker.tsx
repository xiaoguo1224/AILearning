"use client";

import { useEffect, useRef, useState } from "react";
import { recordCourseOpen } from "@/lib/api";
import { Typography } from "react-vant";

export function CourseOpenTracker({ courseId }: { courseId: number }) {
  const recorded = useRef<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (recorded.current === courseId) return;
    recorded.current = courseId;
    void recordCourseOpen(courseId).catch(() => setError(true));
  }, [courseId]);
  return error ? <Typography.Text type="secondary">打开次数记录失败，不影响课程学习。</Typography.Text> : null;
}
