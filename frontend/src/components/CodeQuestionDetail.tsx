"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button as AntButton, Tabs, Table, Input } from "antd";
import { useI18n } from "@/components/LocaleProvider";
import { QuizMarkdown } from "@/components/QuizMarkdown";
import { SubmissionReviewPanel } from "@/components/SubmissionReviewPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ApiError,
  createQuestionSubmission,
  getJob,
  getSubmission,
  listQuestionSubmissions,
  startQuestionSolutionJob,
  uploadQuestionSubmission,
} from "@/lib/api";
import type { QuizBankItem } from "@/lib/api";
import type { SubmissionDetail, SubmissionSummary } from "@/lib/types";

type Tab = "question" | "answer" | "review" | "history";

/**
 * Code question detail: the question, the answer editor, the AI review, and
 * the submission history live on separate tabs — the submission page's shape,
 * adapted for answering a question rather than a free-floating upload.
 */
export function CodeQuestionDetail({
  courseId,
  item,
}: {
  courseId: number;
  item: QuizBankItem;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("question");
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [code, setCode] = useState("");
  const [log, setLog] = useState("");
  const [note, setNote] = useState("");
  const [codeFile, setCodeFile] = useState<File | null>(null);
  const [logFile, setLogFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SubmissionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SubmissionDetail | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solution, setSolution] = useState<string | null>(item.solution ?? null);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [generatingSolution, setGeneratingSolution] = useState(false);

  async function refreshHistory(selectId: number | null) {
    try {
      const list = await listQuestionSubmissions(item.id);
      setHistory(list.items);
      const nextId = selectId ?? list.items[0]?.id ?? null;
      setSelectedId(nextId);
      if (nextId !== null) {
        try {
          setSelected(await getSubmission(nextId));
        } catch {
          setSelected(null);
        }
      } else {
        setSelected(null);
      }
    } catch {
      // History is a convenience; the question still renders.
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadSolution() {
    setGeneratingSolution(true);
    try {
      const { job_id } = await startQuestionSolutionJob(item.id);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await getJob(job_id);
        if (job.status === "completed" && job.result?.solution) {
          setSolution(String(job.result.solution));
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") break;
      }
    } catch {
      // Keep the previous solution (or none) on failure.
    } finally {
      setGeneratingSolution(false);
    }
  }

  async function selectSubmission(id: number) {
    setSelectedId(id);
    try {
      setSelected(await getSubmission(id));
    } catch {
      setSelected(null);
    }
  }

  useEffect(() => {
    void refreshHistory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function submit() {
    if (submitting) return;
    const hasPasteInput = code.trim() || log.trim();
    const hasUploadInput = codeFile || logFile;
    if (mode === "paste" ? !hasPasteInput : !hasUploadInput) return;
    setSubmitting(true);
    setError(null);
    try {
      let detail: SubmissionDetail;
      if (mode === "paste") {
        detail = await createQuestionSubmission(item.id, {
          code: code.trim() || undefined,
          log_content: log.trim() || undefined,
          user_note: note.trim() || undefined,
        });
      } else {
        const form = new FormData();
        if (codeFile) form.append("code_file", codeFile);
        if (logFile) form.append("log_file", logFile);
        if (note.trim()) form.append("user_note", note.trim());
        detail = await uploadQuestionSubmission(item.id, form);
      }
      setCode("");
      setLog("");
      setNote("");
      setCodeFile(null);
      setLogFile(null);
      await refreshHistory(detail.id);
      setTab("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "question", label: t("Question") },
    { id: "answer", label: t("Answer") },
    { id: "review", label: t("Review") },
    { id: "history", label: t("History") },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={`/courses/${courseId}`}
        className="text-small text-accent underline"
      >
        {t("Back to course")}
      </Link>

      <PageHeader
        title={t("Code question")}
        description={item.concept || undefined}
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
        items={tabs.map((tabItem) => ({
          key: tabItem.id,
          label: `${tabItem.label}${tabItem.id === "history" && history.length > 0 ? ` (${history.length})` : ""}`,
        }))}
      />

      {tab === "question" && (
        <section className="space-y-4">
          <div className="rounded-surface border border-line p-6">
            <QuizMarkdown content={item.question} />
          </div>
          <div className="rounded-surface border border-line p-4">
            <AntButton
                      onClick={() => {
                const next = !solutionOpen;
                setSolutionOpen(next);
                if (next && !solution && !generatingSolution) void loadSolution();
              }}
              aria-expanded={solutionOpen}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-small font-medium">
                <span aria-hidden className="mr-1 text-ink-muted">
                  {solutionOpen ? "▾" : "▸"}
                </span>
                {t("Reference solution")}
              </span>
              {solution && (
                <span className="text-micro text-ink-muted">{t("AI-generated")}</span>
              )}
            </AntButton>
            {solutionOpen && (
              <div className="mt-3">
                {generatingSolution && !solution ? (
                  <p className="text-small text-ink-muted">{t("Generating solution…")}</p>
                ) : solution ? (
                  <>
                    <QuizMarkdown content={solution} />

                  </>
                ) : (
                  <p className="text-small text-ink-muted">{t("No solution yet.")}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "answer" && (
        <section className="space-y-4">
          {error && <ErrorState message={error} />}
          <div role="tablist" aria-label={t("Submission method")} className="flex gap-1">
            {(["paste", "upload"] as const).map((m) => (
              <AntButton
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-control px-3 py-1.5 text-small font-medium transition-colors ${
                  mode === m
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {t(m === "paste" ? "Paste" : "Upload files")}
              </AntButton>
            ))}
          </div>
          {mode === "paste" ? (
            <>
              <label className="block text-small font-medium">
                {t("Your code")}
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  rows={12}
                  disabled={submitting}
                  placeholder={t("Write your code here…")}
                  className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-small"
                />
              </label>
              <label className="block text-small font-medium">
                {t("Run log (optional)")}
                <textarea
                  value={log}
                  onChange={(e) => setLog(e.target.value)}
                  rows={6}
                  disabled={submitting}
                  placeholder={t("Paste the log from running your code locally…")}
                  className="mt-1 block w-full rounded-control border border-line-strong bg-surface px-3 py-2 font-mono text-small"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-small font-medium">
                {t("Code file (.py or .zip)")}
                <input
                  type="file"
                  accept=".py,.zip,.txt"
                  disabled={submitting}
                  onChange={(e) => setCodeFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-small"
                />
              </label>
              <label className="block text-small font-medium">
                {t("Log file (optional)")}
                <input
                  type="file"
                  accept=".log,.txt"
                  disabled={submitting}
                  onChange={(e) => setLogFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-small"
                />
              </label>
            </>
          )}
          <label className="block text-small font-medium">
            {t("Note (optional)")}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              placeholder={t("What did you try? What failed?")}
              className="mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
            />
          </label>
          <div className="flex justify-end">
            <Button
              disabled={
                submitting || (mode === "paste" ? !(code.trim() || log.trim()) : !(codeFile || logFile))
              }
              onClick={() => void submit()}
            >
              {submitting ? t("Submitting…") : t("Submit for review")}
            </Button>
          </div>
          <p className="text-small text-ink-muted">
            {t("The AI reviews your code against this question. Nothing runs on the server.")}
          </p>
        </section>
      )}

      {tab === "review" && (
        <section className="space-y-4">
          {loadingHistory ? (
            <p className="text-small text-ink-muted">{t("Loading…")}</p>
          ) : selected ? (
            <>
              <div className="flex items-center gap-2">
                <Badge tone={selected.status === "reviewed" ? "success" : "neutral"}>
                  {t("v{0}", selected.version)}
                </Badge>
                <span className="text-small text-ink-muted">
                  {t(selected.status === "reviewed" ? "Reviewed" : "Submitted")}
                </span>
              </div>
              {selected.artifacts.map((artifact) => (
                <div key={artifact.id} className="rounded-surface border border-line p-4">
                  <p className="font-mono text-small text-ink">{artifact.filename}</p>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-control bg-surface-sunken p-3 font-mono text-small">
                    {artifact.content}
                  </pre>
                </div>
              ))}
              <SubmissionReviewPanel
                submissionId={selected.id}
                initialReviews={selected.reviews}
              />
            </>
          ) : (
            <p className="text-small text-ink-muted">
              {t("No submissions yet. Write your code on the Answer tab.")}
            </p>
          )}
        </section>
      )}

      {tab === "history" && (
        <section>
          <Table
            loading={loadingHistory}
            dataSource={history}
            rowKey="id"
            pagination={false}
            scroll={{ y: 400 }}
            onRow={(entry) => ({
              onClick: () => {
                void selectSubmission(entry.id);
                setTab("review");
              },
            })}
            columns={[
              {
                title: t("Version"),
                dataIndex: "version",
                key: "version",
                render: (_, entry) => (
                  <Badge tone={entry.id === selectedId ? "success" : "neutral"}>
                    {t("v{0}", entry.version)}
                  </Badge>
                ),
              },
              {
                title: t("Status"),
                dataIndex: "status",
                key: "status",
                render: (_, entry) => t(entry.status === "reviewed" ? "Reviewed" : "Submitted"),
              },
              {
                title: t("Review result"),
                key: "review",
                render: (_, entry) =>
                  entry.latest_review ? (
                    entry.latest_review.finding_count === 0 ? (
                      <span style={{ color: "green" }}>{t("No issues found")}</span>
                    ) : (
                      t("{0} issue(s)", entry.latest_review.finding_count)
                    )
                  ) : (
                    "—"
                  ),
              },
              {
                title: t("Submitted at"),
                dataIndex: "created_at",
                key: "created_at",
                render: (_, entry) => new Date(entry.created_at).toLocaleString(),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}
