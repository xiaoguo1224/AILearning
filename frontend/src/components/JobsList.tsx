"use client";

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

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const link = jobLink(job);
        const label = TYPE_LABELS[job.type] ?? job.type;
        return (
          <div key={job.id} className="rounded-surface border border-line p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-small font-medium">{t(label)}</span>
                <Badge
                  tone={
                    job.status === "completed"
                      ? "success"
                      : job.status === "failed"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {t(job.status)}
                </Badge>
              </div>
              <span className="text-micro text-ink-muted">
                {new Date(job.created_at).toLocaleString()}
              </span>
            </div>
            <div className="mt-3">
              <JobProgressBar job={job} />
            </div>
            <div className="mt-3 flex items-center gap-2">
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
              {link && (
                <Link
                  href={link}
                  className="rounded-control border border-line px-2 py-1 text-small text-ink-muted hover:text-ink"
                >
                  {t("Open")}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
