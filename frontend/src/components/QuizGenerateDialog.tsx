"use client";

import { useState } from "react";

import { Alert, Button, Input, Modal } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { ApiError, getJob, startQuizGenerateJob, type QuizKindCount } from "@/lib/api";
import { QUIZ_KINDS, type QuizKind } from "@/lib/quizKinds";

/**
 * One place a learner can ask for questions: the whole course, one chapter, or
 * one lesson.
 *
 * `lessonIds` is the material the scope covers. Empty means "the whole course",
 * which the server accepts as a lesson-less request; a chapter is a LIST of
 * lessons because the API generates per lesson, so a chapter request is split
 * across them rather than pretending the server has a chapter concept.
 */
export interface QuizScopeOption {
  value: string;
  label: string;
  lessonIds: number[];
}

/**
 * The "AI 出题" dialog.
 *
 * ONE implementation for the lesson page, the course page and the course's
 * question bank. They had drifted into two: the lesson page grew a designed
 * dialog (an icon and a one-line explanation per kind, steppers, an optional
 * instruction box) while the bank page got a bare column of number inputs. The
 * same question — "what should I be asked?" — should not look like two products.
 */
export function QuizGenerateDialog({
  courseId,
  scopes,
  initialScope,
  onClose,
  onGenerated,
}: {
  courseId: number;
  scopes: QuizScopeOption[];
  initialScope?: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const { t } = useI18n();
  const [scopeValue, setScopeValue] = useState(initialScope ?? scopes[0]?.value ?? "all");
  const [counts, setCounts] = useState<Record<string, number>>({
    mcq: 2,
    fill: 0,
    short: 0,
    truefalse: 0,
    code: 0,
  });
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = QUIZ_KINDS.reduce((sum, k) => sum + (counts[k] || 0), 0);

  /**
   * Typed by QuizKind so a kind added to QUIZ_KINDS without metadata here is a
   * type error rather than a runtime crash on `meta.icon`.
   */
  const KIND_META: Record<QuizKind, { icon: string; desc: string }> = {
    mcq: { icon: "☰", desc: t("Multiple choice with options") },
    fill: { icon: "▭", desc: t("Fill in the blank with one term or number") },
    short: { icon: "✎", desc: t("Short answer in your own words") },
    truefalse: { icon: "✓", desc: t("True or false judgment") },
    code: { icon: "⟨/⟩", desc: t("Programming exercise") },
  };

  function adjust(kind: string, delta: number) {
    setCounts((c) => ({ ...c, [kind]: Math.max(0, Math.min(20, (c[kind] || 0) + delta)) }));
  }

  async function runOne(lessonId: number | undefined, kindCounts: Record<string, number>) {
    const items: QuizKindCount[] = QUIZ_KINDS.filter((k) => (kindCounts[k] || 0) > 0).map((k) => ({
      kind: k,
      count: kindCounts[k],
    }));
    if (items.length === 0) return;
    const { job_id } = await startQuizGenerateJob(
      courseId,
      items,
      lessonId,
      prompt.trim() || undefined,
    );
    for (let i = 0; i < 90; i++) {
      const job = await getJob(job_id);
      if (job.status === "completed") return;
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(job.error || t("Could not generate questions."));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(t("Could not generate questions."));
  }

  async function submit() {
    const scope = scopes.find((s) => s.value === scopeValue) ?? scopes[0];
    if (!scope) return;
    if (total === 0) {
      setError(t("Ask for at least one question."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (scope.lessonIds.length === 0) {
        await runOne(undefined, counts);
      } else {
        // Spread the request over the scope's lessons rather than asking one lesson
        // for a chapter's worth: the model is shown ONE lesson's material, so a
        // chapter's questions have to come from the chapter's lessons one by one.
        const perLesson = new Map<number, Record<string, number>>();
        for (const kind of QUIZ_KINDS) {
          let remaining = counts[kind] || 0;
          let turn = 0;
          while (remaining > 0) {
            const lessonId = scope.lessonIds[turn % scope.lessonIds.length];
            const bucket = perLesson.get(lessonId) ?? {};
            bucket[kind] = (bucket[kind] ?? 0) + 1;
            perLesson.set(lessonId, bucket);
            remaining -= 1;
            turn += 1;
          }
        }
        let done = 0;
        for (const [lessonId, kindCounts] of perLesson) {
          setProgress(t("{0} of {1} lessons", done, perLesson.size));
          await runOne(lessonId, kindCounts);
          done += 1;
        }
      }
      onGenerated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t("Could not generate questions."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={true} onCancel={onClose} title={null} footer={null} width={520}>
      <div style={{ padding: "8px 4px" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>{t("AI 出题")}</h3>
        <p style={{ color: "var(--sf-ink-muted)", fontSize: 13, margin: "0 0 20px" }}>
          {t("Pick the types and how many of each.")}
        </p>

        {scopes.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{t("Scope")}</div>
            <select
              value={scopeValue}
              disabled={busy}
              onChange={(e) => setScopeValue(e.target.value)}
              aria-label={t("Scope")}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--sf-line)",
                background: "var(--sf-surface)",
                color: "var(--sf-ink)",
                fontSize: 14,
              }}
            >
              {scopes.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {QUIZ_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const active = (counts[kind] || 0) > 0;
            return (
              <div
                key={kind}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1px solid ${active ? "var(--sf-accent)" : "var(--sf-line)"}`,
                  background: active
                    ? "color-mix(in srgb, var(--sf-accent) 6%, transparent)"
                    : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    background: active ? "var(--sf-accent)" : "var(--sf-surface)",
                    color: active ? "var(--sf-on-fill)" : "var(--sf-ink-muted)",
                    transition: "all 0.2s",
                  }}
                >
                  {meta.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t(`quiz_kind_${kind}`)}</div>
                  <div style={{ fontSize: 12, color: "var(--sf-ink-muted)" }}>{meta.desc}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Button
                    size="small"
                    shape="circle"
                    aria-label={t("One fewer {0}", t(`quiz_kind_${kind}`))}
                    disabled={busy || (counts[kind] || 0) <= 0}
                    onClick={() => adjust(kind, -1)}
                  >
                    −
                  </Button>
                  <span
                    style={{
                      minWidth: 28,
                      textAlign: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      color: active ? "var(--sf-accent)" : "var(--sf-ink-muted)",
                    }}
                  >
                    {counts[kind] || 0}
                  </span>
                  <Button
                    size="small"
                    shape="circle"
                    aria-label={t("One more {0}", t(`quiz_kind_${kind}`))}
                    disabled={busy || (counts[kind] || 0) >= 20}
                    onClick={() => adjust(kind, 1)}
                  >
                    ＋
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: "var(--sf-ink)" }}>
            {t("出题要求（可选）")}
          </div>
          <Input.TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("例如：侧重 Transformer 的注意力机制，出中等难度的应用题…")}
            rows={3}
            disabled={busy}
            maxLength={500}
            showCount
            style={{ resize: "vertical" }}
          />
        </div>

        {error && <Alert title={error} type="error" showIcon style={{ marginTop: 16 }} />}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--sf-ink-muted)" }}>
            {progress
              ? progress
              : total > 0
                ? t("Total: {0} questions", total)
                : t("Select at least one question")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onClose} disabled={busy}>
              {t("Cancel")}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={total === 0 || busy}
              onClick={submit}
              style={{ minWidth: 120 }}
            >
              {busy ? t("Generating…") : t("Generate")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}