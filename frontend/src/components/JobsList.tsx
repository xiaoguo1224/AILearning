"use client";

import { Badge as AntBadge, Table } from "antd";
import { useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/components/LocaleProvider";
import { JobCancelButton, JobProgressBar } from "@/components/JobProgress";
import { Badge } from "@/components/ui/Badge";
import { listJobs, type Job } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  course_generate: "Course generation",
  course_regenerate: "Course regeneration",
  lesson_regenerate: "Lesson regeneration",
  quiz_generate: "Question generation",
  quiz_variant: "Question variant",
  quiz_solution: "Reference solution",
  code_review_llm: "Code review",
};

function jobLink(job: Job): string | null {
  if (job.ref_type === "course" && job.ref_id) return `/courses/${job.ref_id}`;
  if (job.ref_type === "lesson" && job.ref_id) {
    // Lesson page needs the course id; link to jobs page anchor instead.
    return null;
  }
  if (job.type === "course_generate" && job.status === "completed") {
    const courseId = job.result?.course_id;
    if (courseId != null) return `/courses/${String(courseId)}`;
  }
  return null;
}

/**
 * Live list of background AI jobs with progress bars.
 * Polls every 3 seconds; each job survives page navigation.
 */
export function JobsList() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listJobs();
        if (!cancelled) {
          setJobs(result.items);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return <p className="text-small text-ink-muted">{t("Loading…")}</p>;
  }

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
          text={t(status)}
        />
      ),
    },
    {
      title: t("Created"),
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (ts: string) => (
        <span style={{ fontSize: 12, color: "#666" }}>
          {new Date(ts).toLocaleString()}
        </span>
      ),
    },
    {
      title: t("Action"),
      key: "action",
      width: 120,
      render: (_: unknown, job: Job) => {
        const link = jobLink(job);
        return (
          <span style={{ display: "flex", gap: 8 }}>
            {["pending", "running"].includes(job.status) && (
              <JobCancelButton
                jobId={job.id}
                onCancelled={() =>
                  setJobs((prev) =>
                    prev.map((j) => (j.id === job.id ? { ...j, status: "cancelled" } : j)),
                  )
                }
              />
            )}
            {link && <Link href={link}>{t("Open")}</Link>}
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
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      expandable={{
        expandedRowRender: (job: Job) => (
          <div style={{ padding: "8px 0" }}>
            <JobProgressBar job={job} />
            {job.error && (
              <div style={{ marginTop: 12, color: "red" }}>
                <strong>Error:</strong> {job.error}
              </div>
            )}
            {job.result && (
              <details style={{ marginTop: 12 }}>
                <summary>Result</summary>
                <pre style={{ fontSize: 12, overflow: "auto" }}>
                  {JSON.stringify(job.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ),
      }}
    />
  );
}
