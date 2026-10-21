"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Cell, Collapse, Field, Flex, Loading, NoticeBar, Radio, Slider, Space, Steps, Tag, Typography } from "react-vant";

import { JobCancelButton, JobProgressBar, useJob } from "@/components/JobProgress";
import { JobTrace } from "@/components/JobTrace";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { retryGeneration, reviewGeneration, startStagedGeneration } from "@/lib/api";

type ReviewMode = "auto" | "outline" | "full";
const MODE_OPTIONS = [
  { value: "auto", title: "全自动审查", desc: "AI 自动检查提纲与章节并修订，无需逐步人工确认；内容仍需核实" },
  { value: "outline", title: "提纲审查", desc: "先审阅提纲，可反复提出意见；确认后并行生成章节" },
  { value: "full", title: "全量审查", desc: "提纲确认后并行生成章节，每章均可提出意见重新生成并确认" },
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

  return (
    <Space direction="vertical" block gap={20}>
      <Steps active={step}>
        <Steps.Item>输入与模式</Steps.Item><Steps.Item>提纲审查</Steps.Item>
        <Steps.Item>并行生成</Steps.Item><Steps.Item>章节审查</Steps.Item>
      </Steps>
      {(error || pollError) && <NoticeBar text={error || pollError} color="var(--danger)" scrollable={false} wrapable />}
      {!jobId ? (
        <Cell.Group title="创建课程" card>
          <Field label="课程主题" type="textarea" value={topic} onChange={setTopic}
            maxLength={20000} placeholder="例如：Python 数据分析入门" rows={3} disabled={busy} />
          <Cell title="课程难度与内容量" value={["低 · 基础精简", "中 · 常规深度", "高 · 深入丰富"][difficulty]} />
          <Cell><Slider min={0} max={2} step={1} value={difficulty} onChange={(value: number | [number, number]) => setDifficulty(Number(value))}
            disabled={busy} button={<Tag type="primary">{["低", "中", "高"][difficulty]}</Tag>} /></Cell>
          <Cell><Flex justify="between">{["低", "中", "高"].map((label, value) => <Flex.Item key={label}>
            <Button size="small" type={difficulty === value ? "primary" : "default"} disabled={busy}
              onClick={() => setDifficulty(value)} aria-pressed={difficulty === value}>{label}</Button>
          </Flex.Item>)}</Flex></Cell>
          <Cell title="审查模式" />
          <Cell><Radio.Group value={mode} onChange={value => setMode(value as ReviewMode)} disabled={busy}>
            <Space direction="vertical" gap={16}>{MODE_OPTIONS.map(opt => <Radio key={opt.value} name={opt.value}>
              <Space direction="vertical"><Typography.Text strong>{opt.title}</Typography.Text>
                <Typography.Text type="secondary">{opt.desc}</Typography.Text></Space>
            </Radio>)}</Space>
          </Radio.Group></Cell>
          <Cell><Button type="primary" loading={busy} disabled={!topic.trim()} onClick={() => void start()} block>
            {mode === "auto" ? "开始自动生成" : "生成提纲"}
          </Button></Cell>
        </Cell.Group>
      ) : !job ? <Loading>正在恢复任务进度…</Loading> : (
        <>
          <Cell.Group title={progress?.topic || "课程生成任务"} card>
            <Cell title={MODE_OPTIONS.find(o => o.value === activeMode)?.title} value={`难度${["低", "中", "高"][progress?.difficulty ?? 1]}`} />
            <Cell><JobProgressBar job={job} /></Cell>
            {progress?.current && <Cell title="当前章节" value={progress.current} />}
            {progress?.generated != null && <Cell title={`已生成 ${progress.generated}/${progress.total} 章`} value={`已确认 ${progress.done ?? 0} 章`} />}
            {["pending", "running"].includes(job.status) || (job.status === "awaiting_review" && !reviewing) ?
              <NoticeBar text="正在处理。可离开此页面，稍后从 AI 任务页返回继续查看或审查。" scrollable={false} wrapable /> : null}
            {reviewing && <NoticeBar text="等待你审阅。确认提纲后才生成内容；全量审查须确认所有章节后保存课程。" scrollable={false} wrapable />}
            <Cell><Space wrap>
              <Button size="small" onClick={() => router.push("/jobs")}>查看所有 AI 任务</Button>
              {["pending", "running", "awaiting_review"].includes(job.status) && <JobCancelButton jobId={job.id} onCancelled={refresh} />}
              {job.status === "failed" && job.type === "course_generate_staged" && <Button loading={busy} onClick={async () => {
                setBusy(true); setError(null);
                try { await retryGeneration(job.id); refresh(); }
                catch (err) { setError(err instanceof Error ? err.message : "重试失败"); }
                finally { setBusy(false); }
              }}>重试未完成步骤</Button>}
              {job.status === "completed" && typeof courseId === "number" && <Button type="primary" onClick={() => {
                router.push(`/courses/${courseId}`); onClose?.();
              }}>打开已生成课程</Button>}
            </Space></Cell>
          </Cell.Group>
          {progress?.outline && <Cell.Group title="课程提纲" card>
            <Cell title={progress.outline.title} />
            {progress.outline.modules.map((module, mi) => <Cell.Group title={`${mi + 1}. ${module.title}`} key={mi}>
              {module.lessons.map((lesson, li) => <Cell key={li} title={`${mi + 1}.${li + 1} ${lesson.title}`} />)}
            </Cell.Group>)}
          </Cell.Group>}
          {reviewing && !outlineReview && progress?.draft && <Cell.Group title={`章节审查 · ${(progress.done ?? 0) + 1}/${progress.total}`} card>
            <Cell title={progress.draft.title} />
            <Cell><LessonMarkdown title={progress.draft.title} content={progress.draft.content} /></Cell>
            <Cell title="本章练习与参考答案（AI 生成，未验证）" />
            <Collapse>{progress.draft.quiz.map((item, i) => <Collapse.Item key={i} name={i} title={item.question}>
              <Space direction="vertical" block>{item.options?.map((option, oi) => <Typography.Text key={oi}>{option}</Typography.Text>)}
                <Typography.Text>参考答案：{item.answer}</Typography.Text></Space>
            </Collapse.Item>)}</Collapse>
          </Cell.Group>}
          {reviewing && <Cell.Group title={outlineReview ? "提纲审阅意见" : "章节审阅意见"} card>
            <Field label="修改意见" type="textarea" value={feedback} onChange={setFeedback} rows={3}
              maxLength={8000} disabled={busy} placeholder="填写需要修改、补充或调整的内容" />
            <Cell><Space wrap>
              <Button loading={busy} disabled={!feedback.trim()} onClick={() => void decide("revise")}>按意见重新生成</Button>
              <Button type="primary" loading={busy} onClick={() => void decide("approve")}>
                {outlineReview ? "确认提纲，开始生成内容" : "确认本章，继续"}
              </Button>
            </Space></Cell>
          </Cell.Group>}
          {progress?.lessons && progress.lessons.length > 0 && <Cell.Group title="已确认章节" card>
            <Collapse>{progress.lessons.map((lesson, i) => <Collapse.Item key={i} name={i} title={`${i + 1}. ${lesson.title}`}>
              <LessonMarkdown title={lesson.title} content={lesson.content} />
            </Collapse.Item>)}</Collapse>
          </Cell.Group>}
          <JobTrace job={job} />
        </>
      )}
    </Space>
  );
}
