"use client";

import { Button, Cell, Collapse, Empty, Loading, NoticeBar, Pagination, Space, Tag, Typography } from "react-vant";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { JobCancelButton, JobProgressBar } from "@/components/JobProgress";
import { JobTrace } from "@/components/JobTrace";
import { listJobs, type Job } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  course_generate: "课程生成", course_generate_staged: "课程生成与审查",
  course_regenerate: "课程重新生成", lesson_regenerate: "章节重新生成",
  quiz_generate: "题目生成", quiz_variant: "变式题生成", quiz_solution: "参考解法",
  code_review_llm: "代码评审", project_graph_extract: "知识图谱关系提取",
};

function jobLink(job: Job): string | null {
  if (["course_generate_staged", "course_generate"].includes(job.type)) {
    return `/courses/new?job=${encodeURIComponent(job.id)}`;
  }
  if (job.type === "project_graph_extract" && job.ref_id) return `/projects/${job.ref_id}/knowledge`;
  if (job.status === "completed" && typeof job.result?.course_id === "number") return `/courses/${job.result.course_id}`;
  if (job.ref_type === "course" && job.ref_id) return `/courses/${job.ref_id}`;
  return null;
}

export function JobsList() {
  const { t } = useI18n();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listJobs(undefined, pageSize, (page - 1) * pageSize);
        if (!cancelled) { setJobs(result.items); setTotal(result.total); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "任务列表加载失败");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [page, pageSize]);

  return <Space direction="vertical" block gap={16}>
    {error && <NoticeBar text={error} color="var(--danger)" scrollable={false} wrapable />}
    {loading ? <Loading>{t("Loading…")}</Loading> : jobs.length === 0 ? <Empty description="暂无 AI 任务" /> :
      <Collapse>{jobs.map(job => {
        const href = jobLink(job);
        return <Collapse.Item key={job.id} name={job.id}
          title={TYPE_LABELS[job.type] ?? job.type}
          label={job.progress?.topic || new Date(/[Zz]|[+-]\d{2}:\d{2}$/.test(job.created_at) ? job.created_at : `${job.created_at}Z`).toLocaleString()}
          value={<Tag type={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "primary"}>
            {job.status === "awaiting_review" ? "等待审阅" : t(job.status)}</Tag>}>
          <Space direction="vertical" block gap={16}>
            <JobProgressBar job={job} />
            <Space wrap>
              {href && <Button type="primary" size="small" onClick={() => router.push(href)}>
                {job.status === "awaiting_review" ? "继续审查" : "打开进度 / 结果"}</Button>}
              {["pending", "running", "awaiting_review"].includes(job.status) && <JobCancelButton jobId={job.id}
                onCancelled={() => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "cancelled" } : j))} />}
            </Space>
            <JobTrace job={job} />
            {job.result && <Cell title="任务结果" label={<Typography.Text style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(job.result, null, 2)}</Typography.Text>} />}
          </Space>
        </Collapse.Item>;
      })}</Collapse>}
    <Cell title={`共 ${total} 个任务`} />
    <Pagination value={page} itemsPerPage={pageSize} totalItems={total} onChange={setPage} prevText="上一页" nextText="下一页" />
  </Space>;
}
