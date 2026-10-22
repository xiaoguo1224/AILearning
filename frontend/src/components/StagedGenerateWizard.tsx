"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Collapse, Input, Radio, Slider, Space, Spin, Steps, Typography } from "antd";
import { JobCancelButton, JobProgressBar, useJob } from "@/components/JobProgress";
import { JobTrace } from "@/components/JobTrace";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { retryGeneration, reviewGeneration, startStagedGeneration } from "@/lib/api";

type ReviewMode = "auto" | "outline" | "full";
const MODE_OPTIONS = [
  { value: "auto", title: "全自动审查", desc: "AI 自动检查提纲与章节并修订；内容仍需核实" },
  { value: "outline", title: "提纲审查", desc: "先审阅并确认提纲，再并行生成章节" },
  { value: "full", title: "全量审查", desc: "确认提纲后逐章审阅，可提出意见重新生成并确认" },
];

export function StagedGenerateWizard({ initialJobId, onClose }: { initialJobId?: string; onClose?: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<ReviewMode>("outline");
  const [difficulty, setDifficulty] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState(initialJobId ?? null);
  const [submittedRevision, setSubmittedRevision] = useState<number | null>(null);
  const { job, error: pollError, refresh } = useJob(jobId);
  const progress = job?.progress;
  const reviewing = job?.status === "awaiting_review" && progress?.revision !== submittedRevision;
  const outlineReview = progress?.stage === "outline_review";
  const activeMode = progress?.mode ?? mode;
  const courseId = job?.result?.course_id;
  const step = job?.status === "completed" ? 3 : !jobId ? 0 :
    progress?.stage === "outline" || outlineReview ? 1 : reviewing ? 3 : 2;

  async function start() {
    if (busy || !topic.trim()) return;
    setBusy(true); setError(null);
    try {
      const { job_id } = await startStagedGeneration(topic.trim(), mode, difficulty);
      setJobId(job_id);
      router.replace(`/courses/new?job=${encodeURIComponent(job_id)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "无法创建生成任务"); }
    finally { setBusy(false); }
  }

  async function decide(action: "approve" | "revise") {
    if (!job || !reviewing || busy || progress?.revision == null) return;
    setBusy(true); setError(null);
    try {
      await reviewGeneration(job.id, action, progress.revision, feedback);
      setSubmittedRevision(progress.revision); setFeedback("");
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "审查提交失败"); }
    finally { setBusy(false); }
  }

  async function retry() {
    if (!job || busy) return;
    setBusy(true); setError(null);
    try { await retryGeneration(job.id); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "重试失败"); }
    finally { setBusy(false); }
  }

  return <Space orientation="vertical" size={20} style={{ width: "100%" }}>
    <Steps current={step} items={[{ title: "输入与模式" }, { title: "提纲审查" }, { title: "并行生成" }, { title: "章节审查" }]} />
    {(error || pollError) && <Alert type="error" title={error || pollError} showIcon />}
    {!jobId ? <Card title="创建课程">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>课程主题</div>
        <Input.TextArea value={topic} onChange={event => setTopic(event.target.value)} maxLength={20000}
          placeholder="例如：Python 数据分析入门" rows={3} disabled={busy} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 12 }}>课程难度 · {["低 - 基础精简", "中 - 常规深度", "高 - 深入丰富"][difficulty]}</div>
        <Slider min={0} max={2} step={1} value={difficulty} onChange={setDifficulty} disabled={busy}
          marks={{ 0: "低", 1: "中", 2: "高" }} style={{ maxWidth: 400 }} />
        <Space>{["低", "中", "高"].map((label, value) => <Button key={label} size="small"
          type={difficulty === value ? "primary" : "default"} disabled={busy} aria-pressed={difficulty === value}
          onClick={() => setDifficulty(value)}>{label}</Button>)}</Space>
      </div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 12 }}>审查模式</div>
        <Radio.Group value={mode} onChange={event => setMode(event.target.value)} disabled={busy}>
          <Space orientation="vertical">{MODE_OPTIONS.map(option => <Radio key={option.value} value={option.value}>
            <strong>{option.title}</strong><div>{option.desc}</div>
          </Radio>)}</Space>
        </Radio.Group>
      </div>
      <Button type="primary" size="large" loading={busy} disabled={!topic.trim()} onClick={() => void start()} block>
        {mode === "auto" ? "开始自动生成" : "生成提纲"}
      </Button>
    </Card> : !job ? <Spin description="正在恢复任务进度…" /> : <>
      <Card title={progress?.topic || "课程生成任务"}>
        <p>{MODE_OPTIONS.find(option => option.value === activeMode)?.title} · 难度{["低", "中", "高"][progress?.difficulty ?? 1]}</p>
        <JobProgressBar job={job} />
        {progress?.current && <p>当前章节：{progress.current}</p>}
        {progress?.generated != null && <p>已生成 {progress.generated}/{progress.total} 章 · 已确认 {progress.done ?? 0} 章</p>}
        {reviewing ? <Alert type="info" title="等待你审阅。全量审查须确认所有章节后保存课程。" /> :
          ["pending", "running", "awaiting_review"].includes(job.status) && <Alert type="info" title="任务在后台处理，可从 AI 任务页返回继续查看或审查。" />}
        <Space wrap style={{ marginTop: 16 }}>
          <Button onClick={() => router.push("/jobs")}>查看所有 AI 任务</Button>
          {["pending", "running", "awaiting_review"].includes(job.status) && <JobCancelButton jobId={job.id} onCancelled={refresh} />}
          {job.status === "failed" && job.type === "course_generate_staged" && <Button loading={busy} onClick={() => void retry()}>重试未完成步骤</Button>}
          {job.status === "completed" && typeof courseId === "number" && <Button type="primary" onClick={() => {
            router.push(`/courses/${courseId}`); onClose?.();
          }}>打开已生成课程</Button>}
        </Space>
      </Card>
      {progress?.outline && <Card title="课程提纲">
        <Typography.Title level={4}>{progress.outline.title}</Typography.Title>
        {progress.outline.modules.map((module, index) => <div key={index}>
          <Typography.Title level={5}>{index + 1}. {module.title}</Typography.Title>
          <ul>{module.lessons.map((lesson, lessonIndex) => <li key={lessonIndex}>{index + 1}.{lessonIndex + 1} {lesson.title}</li>)}</ul>
        </div>)}
      </Card>}
      {reviewing && !outlineReview && progress?.draft && <Card title={`章节审查 · ${(progress.done ?? 0) + 1}/${progress.total}`}>
        <Typography.Title level={4}>{progress.draft.title}</Typography.Title>
        <LessonMarkdown title={progress.draft.title} content={progress.draft.content} />
        <Typography.Title level={5}>本章练习与参考答案（AI 生成，未验证）</Typography.Title>
        <Collapse items={progress.draft.quiz.map((item, index) => ({ key: index, label: item.question,
          children: <Space orientation="vertical">{item.options?.map((option, optionIndex) => <p key={optionIndex}>{option}</p>)}<p>参考答案：{item.answer}</p></Space>,
        }))} />
      </Card>}
      {reviewing && <Card title={outlineReview ? "提纲审阅意见" : "章节审阅意见"}>
        <Input.TextArea value={feedback} onChange={event => setFeedback(event.target.value)} rows={3} maxLength={8000}
          disabled={busy} placeholder="填写需要修改、补充或调整的内容" />
        <Space wrap style={{ marginTop: 16 }}>
          <Button loading={busy} disabled={!feedback.trim()} onClick={() => void decide("revise")}>按意见重新生成</Button>
          <Button type="primary" loading={busy} onClick={() => void decide("approve")}>
            {outlineReview ? "确认提纲，开始生成内容" : "确认本章，继续"}
          </Button>
        </Space>
      </Card>}
      {progress?.lessons && progress.lessons.length > 0 && <Card title="已确认章节">
        <Collapse items={progress.lessons.map((lesson, index) => ({ key: index, label: `${index + 1}. ${lesson.title}`,
          children: <LessonMarkdown title={lesson.title} content={lesson.content} />,
        }))} />
      </Card>}
      <JobTrace job={job} />
    </>}
  </Space>;
}
