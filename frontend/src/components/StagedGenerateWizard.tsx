"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, Radio, Slider, Spin, Steps, Alert } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import {
  ApiError,
  generateCourseOutline,
  reviseCourseOutline,
  startCourseGenerateJob,
  getJob,
  getCourse,
  type CourseOutline,
} from "@/lib/api";

type ReviewMode = "auto" | "outline" | "full";

const MODE_OPTIONS = [
  {
    value: "auto" as ReviewMode,
    title: "全自动",
    desc: "AI 直接生成完整课程，无需人工审查",
  },
  {
    value: "outline" as ReviewMode,
    title: "提纲审查",
    desc: "先生成提纲给你审阅确认，再生成内容",
  },
  {
    value: "full" as ReviewMode,
    title: "全量审查",
    desc: "提纲审查 + 每个章节生成后都要审查确认",
  },
];

export function StagedGenerateWizard({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<ReviewMode>("outline");
  const [difficulty, setDifficulty] = useState(1); // 0=低, 1=中, 2=高
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  async function handleGenerateOutline() {
    if (!topic.trim()) {
      setError("请输入课程主题");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { outline } = await generateCourseOutline(topic.trim(), undefined, undefined, difficulty);
      setOutline(outline);
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "提纲生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleReviseOutline() {
    if (!outline || !feedback.trim()) {
      setError("请填写修改意见");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { outline: revised } = await reviseCourseOutline(outline, feedback.trim(), topic.trim());
      setOutline(revised);
      setFeedback("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "提纲修改失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmOutline() {
    if (!outline) return;
    setBusy(true);
    setError(null);
    try {
      // Start course generation with the approved outline as context.
      const { job_id } = await startCourseGenerateJob(
        [{ type: "text", content: `课程提纲：\n${JSON.stringify(outline, null, 2)}` }],
        difficulty,
      );
      setJobId(job_id);
      setStep(2);
      // Poll for completion.
      for (let i = 0; i < 120; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") {
          const courseId = (job.result as { course_id?: number })?.course_id;
          if (courseId) {
            if (mode === "full") {
              setStep(3);
            } else {
              router.push(`/courses/${courseId}`);
              onClose?.();
            }
          }
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error || "课程生成失败");
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "课程生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoGenerate() {
    if (!topic.trim()) {
      setError("请输入课程主题");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await startCourseGenerateJob(
        [{ type: "text", content: topic.trim() }],
        difficulty,
      );
      setJobId(job_id);
      setStep(2);
      for (let i = 0; i < 120; i++) {
        const job = await getJob(job_id);
        if (job.status === "completed") {
          const courseId = (job.result as { course_id?: number })?.course_id;
          if (courseId) {
            router.push(`/courses/${courseId}`);
            onClose?.();
          }
          break;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Error(job.error || "课程生成失败");
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "课程生成失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 0" }}>
      <Steps
        current={step}
        style={{ marginBottom: 32 }}
        items={[
          { title: "输入与模式" },
          { title: "提纲审查", disabled: mode === "auto" },
          { title: "内容生成" },
          { title: "章节审查", disabled: mode !== "full" },
        ]}
      />

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />
      )}

      {step === 0 && (
        <Card title="创建课程">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>课程主题</div>
            <Input.TextArea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：Python 数据分析入门"
              rows={3}
              disabled={busy}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 500, marginBottom: 12 }}>
              课程难度
              <span style={{ color: "var(--ink-muted)", fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                {difficulty === 0 ? "低 - 入门级，内容精简" : difficulty === 1 ? "中 - 常规深度" : "高 - 深入详细，内容丰富"}
              </span>
            </div>
            <Slider
              min={0}
              max={2}
              step={1}
              value={difficulty}
              onChange={setDifficulty}
              disabled={busy}
              marks={{
                0: "低",
                1: "中",
                2: "高",
              }}
              style={{ maxWidth: 400 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 500, marginBottom: 12 }}>审查模式</div>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ width: "100%" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {MODE_OPTIONS.map((opt) => (
                  <Radio key={opt.value} value={opt.value} disabled={busy}>
                    <span style={{ fontWeight: 500 }}>{opt.title}</span>
                    <span style={{ color: "var(--ink-muted)", marginLeft: 8, fontSize: 13 }}>
                      {opt.desc}
                    </span>
                  </Radio>
                ))}
              </div>
            </Radio.Group>
          </div>
          <Button
            type="primary"
            size="large"
            loading={busy}
            onClick={() => (mode === "auto" ? handleAutoGenerate() : handleGenerateOutline())}
            block
          >
            {mode === "auto" ? "开始生成" : "生成提纲"}
          </Button>
        </Card>
      )}

      {step === 1 && outline && (
        <Card
          title="提纲审查"
          extra={
            <Button onClick={() => setStep(0)} disabled={busy}>
              返回修改
            </Button>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>{outline.title}</h3>
            {outline.modules.map((mod, mi) => (
              <div key={mi} style={{ marginTop: 12, paddingLeft: 16, borderLeft: "3px solid var(--accent)" }}>
                <div style={{ fontWeight: 500 }}>
                  {mi + 1}. {mod.title}
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "var(--ink-muted)" }}>
                  {mod.lessons.map((lesson, li) => (
                    <li key={li} style={{ margin: "4px 0" }}>
                      {lesson.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>修改意见</div>
            <Input.TextArea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="例如：第二章太简单了，增加实战案例；第3课和第4课合并…"
              rows={3}
              disabled={busy}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <Button onClick={handleReviseOutline} loading={busy} disabled={!feedback.trim()}>
                按意见修改
              </Button>
              <Button type="primary" onClick={handleConfirmOutline} loading={busy}>
                确认提纲，开始生成内容
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="正在生成课程内容">
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: "var(--ink-muted)" }}>
              AI 正在根据确认的提纲生成课程内容，请稍候…
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink-muted)" }}>
              你可以离开此页面，生成会在后台继续
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="章节审查">
          <ChapterReview onComplete={() => onClose?.()} />
        </Card>
      )}
    </div>
  );
}

function ChapterReview({ onComplete }: { onComplete: () => void }) {
  const [lessons, setLessons] = useState<{ id: number; title: string }[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  // TODO: Load lessons for review
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-muted)" }}>
      章节审查功能开发中…
      <div style={{ marginTop: 16 }}>
        <Button type="primary" onClick={onComplete}>
          完成
        </Button>
      </div>
    </div>
  );
}
