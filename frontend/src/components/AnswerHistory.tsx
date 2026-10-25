"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { useI18n } from "@/components/LocaleProvider";
import { QuizMarkdown } from "@/components/QuizMarkdown";
import { CopyCodeBlock } from "@/components/CopyCodeBlock";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { attachmentUrl, generateHistoryAnalysis, getJob, getAnswerHistory, listAnswerHistory, type AnswerHistoryDetail, type AnswerHistorySummary } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";

export function AnswerHistory({ questionId, courseId, variantId }: { questionId?: number; courseId?: number; variantId?: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AnswerHistorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AnswerHistoryDetail | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const requestId = useRef(0);
  useEffect(() => () => { ++requestId.current; }, []);

  async function load(page = 0) {
    const token = ++requestId.current;
    setLoading(true);
    setError(null);
    setDetail(null);
    setGenerating(false);
    setRevealed(false);
    try {
      const result = await listAnswerHistory({ questionId, courseId, variantId }, page);
      if (token !== requestId.current) return;
      setItems(result.items);
      setTotal(result.total);
      setOffset(page);
    } catch (err) {
      if (token === requestId.current) setError(err instanceof Error ? err.message : t("Could not load answer history."));
    } finally {
      if (token === requestId.current) setLoading(false);
    }
  }

  async function select(id: number, reveal = false) {
    const token = ++requestId.current;
    setLoading(true);
    setError(null);
    if (!reveal) { setDetail(null); setRevealed(false); }
    try {
      const result = await getAnswerHistory(id, reveal);
      if (token !== requestId.current) return;
      setDetail(result);
      setRevealed(reveal);
    } catch (err) {
      if (token === requestId.current) setError(err instanceof Error ? err.message : t("Could not load answer history."));
    } finally {
      if (token === requestId.current) setLoading(false);
    }
  }

  async function generate(kind: "analysis" | "solution" = "analysis") {
    if (!detail || generating) return;
    const id = detail.id;
    const token = ++requestId.current;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateHistoryAnalysis(id, kind);
      if (result.job_id) {
        for (;;) {
          if (requestId.current !== token) return;
          const job = await getJob(result.job_id);
          if (job.status === "completed") break;
          if (job.status === "failed" || job.status === "cancelled") throw new Error(job.error || t("AI analysis failed. Please retry."));
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (requestId.current === token) { setGenerating(false); await select(id, revealed); }
    } catch (err) {
      if (requestId.current === token) setError(err instanceof Error ? err.message : t("AI analysis failed. Please retry."));
    } finally {
      if (requestId.current === token) setGenerating(false);
    }
  }

  const sourceLabel = (source: string) => t(({
    lesson_quiz: "Lesson quiz", review_session: "Review session",
    remedial_practice: "Remedial practice", code_submission: "Code submission",
  } as Record<string, string>)[source] ?? source);

  return <>
    <Button variant="ghost" size="sm" onClick={() => { setOpen(true); void load(); }}>
      {t(questionId || variantId ? "Answer history" : "All answer history")}
    </Button>
    <Modal title={t("Answer history")} open={open} width={900} footer={null}
      onCancel={() => { ++requestId.current; setOpen(false); }}>
      <div className="max-h-[75vh] space-y-4 overflow-y-auto text-ink">
        {error && <><ErrorState message={error} /><Button variant="secondary" onClick={() => detail ? void select(detail.id, revealed) : void load(offset)}>{t("Try again")}</Button></>}
        {loading && <p role="status">{t("Loading…")}</p>}
        {!detail && !loading && !error && <>
          <p className="text-small text-ink-muted">{t("{0} record(s)", total)}</p>
          {items.length === 0 && <p>{t("No answer history yet.")}</p>}
          <ul className="space-y-2">{items.map(item => <li key={item.id}>
            <button type="button" onClick={() => void select(item.id)} className="w-full rounded-control border border-line p-3 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent">
              <span className="block text-small text-ink-muted">{formatDateTime(item.created_at, t.locale)} · {sourceLabel(item.source)} · {t(item.correct === true ? "Correct" : item.correct === false ? "Incorrect" : "Submitted")}</span>
              <span className="block break-words">{item.question?.slice(0, 180) ?? t("Original question not saved")}</span>
            </button>
          </li>)}</ul>
          <div className="flex justify-between gap-3">
            <Button variant="secondary" disabled={offset === 0} onClick={() => void load(offset - 20)}>{t("Previous")}</Button>
            <Button variant="secondary" disabled={offset + 20 >= total} onClick={() => void load(offset + 20)}>{t("Next")}</Button>
          </div>
        </>}
        {detail && <div className="space-y-4">
          <Button variant="secondary" disabled={loading || generating} onClick={() => { setDetail(null); setError(null); }}>{t("Back to history")}</Button>
          <p className="text-small text-ink-muted">{formatDateTime(detail.created_at, t.locale)} · {sourceLabel(detail.source)}</p>
          {!detail.snapshot.complete && <p className="rounded-control bg-warning-surface p-3 text-warning">{t("Legacy record: some original content was not saved. Missing content is not reconstructed.")}</p>}
          <p className="font-medium">{t("Question at submission")}</p>
          {detail.snapshot.question ? <QuizMarkdown content={detail.snapshot.question} /> : <p>{t("Original question not saved")}</p>}
          {!detail.snapshot.question && detail.snapshot.question_context && <><p className="text-small text-ink-muted">{t("Available question context (not an original snapshot)")}</p><QuizMarkdown content={detail.snapshot.question_context} /></>}
          {detail.snapshot.options?.map((option, i) => <QuizMarkdown key={i} content={`${i + 1}. ${option}`} />)}
          <p className="font-medium">{t("Your answer")}</p>
          {detail.snapshot.submitted_answer && (detail.snapshot.kind === "code"
            ? <CopyCodeBlock><code>{detail.snapshot.submitted_answer}</code></CopyCodeBlock>
            : <div className="whitespace-pre-wrap break-words">{detail.snapshot.submitted_answer}</div>)}
          {detail.snapshot.user_note && <p className="whitespace-pre-wrap">{detail.snapshot.user_note}</p>}
          {detail.snapshot.attachments?.map(a => <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="block break-words text-accent underline">{a.filename}</a>)}
          {detail.snapshot.artifacts?.map((a, i) => <div key={i} className="min-w-0"><p>{a.filename}</p><CopyCodeBlock><code>{a.content}</code></CopyCodeBlock></div>)}
          <p className="font-medium">{t("Saved reviews")}</p>
          {!detail.has_analysis && <Button variant="secondary" disabled={generating || !detail.can_generate} onClick={() => void generate()}>{t(generating ? "Generating analysis…" : "Generate analysis for this answer")}</Button>}
          {detail.has_analysis && <p className="text-small text-ink-muted">{t("Showing the saved analysis. No new AI call is needed.")}</p>}
          {detail.snapshot.correct !== undefined && <p>{t(detail.snapshot.correct ? "Correct" : "Incorrect")}</p>}
          {detail.snapshot.feedback && <QuizMarkdown content={detail.snapshot.feedback} />}
          {!detail.snapshot.feedback && !detail.events.some(e => ["code_review", "answer_analysis", "grading_feedback"].includes(e.kind)) && <p className="text-ink-muted">{t("No AI review was saved for this answer.")}</p>}
          {detail.events.map((event, i) => <div key={i} className="space-y-2 rounded-control border border-line p-3">
            <p className="text-small text-ink-muted">{t(({ code_review: "AI review", answer_analysis: "Answer analysis", grading_feedback: "Grading feedback", solution: "Question explanation", hint: "Hint" } as Record<string, string>)[event.kind] ?? event.kind)} · {formatDateTime(event.created_at, t.locale)} {event.payload.model}</p>
            {[event.payload.summary, event.payload.analysis, event.payload.feedback, event.payload.hint, event.payload.hint_level_1].filter(Boolean).map((text, j) => <QuizMarkdown key={j} content={text!} />)}
            {event.payload.findings?.map((f, j) => <div key={j}><p className="text-small text-ink-muted">{f.file}:{f.line_start} · {t(({confirmed_static: "Provable from the code", user_reported: "Your log reports this", inferred: "AI inference", needs_local_check: "Needs a local check"} as Record<string, string>)[f.evidence_type] ?? f.evidence_type)}</p><QuizMarkdown content={f.description} /><QuizMarkdown content={f.suggestion} /></div>)}
            {revealed && [event.payload.solution, event.payload.hint_level_2, event.payload.hint_level_3].filter(Boolean).map((text, j) => <QuizMarkdown key={j} content={text!} />)}
            {revealed && event.payload.reference_solution && <><p className="text-small text-ink-muted">{t("AI generated, unverified")}</p><CopyCodeBlock><code>{event.payload.reference_solution}</code></CopyCodeBlock></>}
          </div>)}
          {!revealed ? <Button variant="secondary" disabled={loading || generating} onClick={() => void select(detail.id, true)}>{t("Show saved answers and hints")}</Button> : <>
            <p className="font-medium">{t("Reference answer")}</p>
            <QuizMarkdown content={detail.snapshot.expected ?? t("Reference answer not saved")} />
            {detail.snapshot.solution && <QuizMarkdown content={detail.snapshot.solution} />}
            {detail.snapshot.hints?.map((hint, i) => <div key={i}><p className="text-small text-ink-muted">{t("Level {0} hint", hint.level)}</p><QuizMarkdown content={hint.hint} /></div>)}
            {!detail.has_solution && <Button variant="secondary" disabled={generating || !detail.can_generate} onClick={() => void generate("solution")}>{t(generating ? "Generating analysis…" : "Generate saved-question explanation")}</Button>}
          </>}
        </div>}
      </div>
    </Modal>
  </>;
}
