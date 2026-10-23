"use client";

import { Alert, Badge as AntBadge, Button, Table } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/components/LocaleProvider";
import { JobCancelButton, JobProgressBar } from "@/components/JobProgress";
import { JobTrace } from "@/components/JobTrace";
import { listJobs, type Job } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";

const TYPE_LABELS: Record<string, string> = {
  course_generate: "Course generation",
  course_generate_staged: "课程生成与审查",
  course_regenerate: "Course regeneration",
  lesson_regenerate: "Lesson regeneration",
  quiz_generate: "Question generation",
  quiz_variant: "Question variant",
  quiz_solution: "Reference solution",
  quiz_answer_analysis: "Answer analysis",
  quiz_grade: "Short-answer grading",
  quiz_hint: "Answer hint",
  code_review_llm: "Code review",
  concept_extract: "Concept extraction",
  project_graph_extract: "Knowledge graph extraction",
};



/**
 * Live list of background AI jobs with progress bars.
 * Polls every 3 seconds; each job survives page navigation.
 */
export function JobsList() {
  const { t } = useI18n();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listJobs(undefined, pageSize, (page - 1) * pageSize);
        if (!cancelled) {
          setJobs(result.items);
          setTotal(result.total);
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setLoading(false); setError(t("Could not reach the server.")); }
      }
    }
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [page, pageSize, t]);

  if (loading) {
    return <p className="text-small text-ink-muted">{t("Loading…")}</p>;
  }

  if (jobs.length === 0 && error) return <Alert type="error" title={error} showIcon />;

  if (jobs.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        {t("No AI jobs yet. Start a generation or regeneration to see it here.")}
      </p>
    );
  }

  const columns = [
    {
      title: t("Type"),
      dataIndex: "type",
      key: "type",
      render: (type: string) => t(TYPE_LABELS[type] ?? type),
    },
    {
      title: t("Status"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => (
        <AntBadge
          status={
            status === "completed" ? "success" : status === "failed" ? "error" : "processing"
          }
          text={status === "awaiting_review" ? "等待审阅" : t(status)}
        />
      ),
    },
    {
      title: t("Created"),
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      responsive: ["md"] as ("md")[],
      render: (ts: string) => (
        <span style={{ fontSize: 12, color: "var(--sf-ink-muted)" }}>
          {formatDateTime(ts, t.locale)}
        </span>
      ),
    },
    {
      title: t("Action"),
      key: "action",
      width: 120,
      render: (_: unknown, job: Job) => {
        // `href` is resolved server-side: a quiz job knows only its item id, and the
        // course is two joins away. Null means the job produced nothing to open.
        const link = job.href;
        return (
          <span style={{ display: "flex", gap: 8 }}>
            {["pending", "running", "awaiting_review"].includes(job.status) && (
              <JobCancelButton
                jobId={job.id}
                onCancelled={() =>
                  setJobs((prev) =>
                    prev.map((j) => (j.id === job.id ? { ...j, status: "cancelled" } : j)),
                  )
                }
              />
            )}
            {link && (job.type === "course_generate_staged" && job.status !== "completed" ?
              <Button size="small" onClick={event => { event.stopPropagation(); router.push(link); }}>
                {job.status === "awaiting_review" ? "继续审查" : "查看生成进度"}
              </Button> : <Link href={link}>{t("Open")}</Link>)}
          </span>
        );
      },
    },
  ];

  return (
    <Table
      dataSource={jobs}
      columns={columns}
      rowKey="id"
      tableLayout="fixed"
      scroll={{ x: "100%" }}
      pagination={{
        current: page,
        pageSize,
        total,
        pageSizeOptions: [10, 20, 50, 100],
        onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); },
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (job: Job) => (
          <div style={{ padding: "8px 0" }}>
            <JobProgressBar job={job} />
            {job.error && (
              <div style={{ marginTop: 12, color: "var(--sf-danger)" }}>
                <strong>Error:</strong> {job.error}
              </div>
            )}
            {job.result && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>Result</summary>
                <pre style={{ fontSize: 12, overflow: "auto", marginTop: 8, padding: 16, borderRadius: 12, background: "var(--sf-surface-sunken)", color: "var(--sf-ink)" }}>
                  {JSON.stringify(job.result, null, 2)}
                </pre>
              </details>
            )}
            <JobTrace job={job} />
          </div>
        ),
      }}
    />
  );
}
