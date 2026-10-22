"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Empty } from "antd";
import { DiagnosisForm, DIAGNOSIS_CAUSES } from "@/components/DiagnosisForm";
import { ApiError, dismissDiagnosis } from "@/lib/api";
import type { ProjectReviewTasks as Tasks } from "@/lib/types";
import { knowledgeStatusLabel } from "@/lib/knowledge";

export function ProjectReviewTasks({ projectId, tasks, archived }: { projectId: number; tasks: Tasks; archived: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function dismiss(id: number) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try { await dismissDiagnosis(id); router.refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("Could not dismiss the diagnosis.")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-6">
    <p className="text-small text-ink-muted">{t("Review suggestions come from recorded mistakes, not a calendar. Reviewing does not prove that a code issue is fixed.")}</p>
    {tasks.items.length === 0 && (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span style={{ color: "var(--sf-ink-muted)" }}>
            {t("No open diagnoses. Choose any knowledge point to keep learning.")}
          </span>
        }
        style={{ padding: "60px 0" }}
      />
    )}
    {tasks.items.map(task => <article key={task.concept_key} className="space-y-3 rounded-surface border border-line p-4">
      <h2 className="text-title">{task.concept_label}</h2>
      {task.knowledge_status && <Badge>{knowledgeStatusLabel(task.knowledge_status, t)}</Badge>}
      <p>{t("{0} open diagnoses", task.open_errors)}</p>
      <div className="flex flex-wrap gap-2">{task.causes.map(cause => <Badge key={cause.cause}>{t(DIAGNOSIS_CAUSES.find(option => option.value === cause.cause)?.label ?? "Unclassified")} · {cause.count}</Badge>)}</div>
      {task.latest_note && <p className="whitespace-pre-wrap">{task.latest_note}</p>}
      {task.latest_detail && <details><summary>{t("Source evidence")}</summary><pre className="whitespace-pre-wrap break-words text-small">{task.latest_detail}</pre></details>}
      <div className="flex flex-wrap items-center gap-4 text-accent underline">
        {task.knowledge_id && <Link href={`/projects/${projectId}/knowledge?entry=${task.knowledge_id}`}>{task.knowledge_title ?? t("Knowledge")}</Link>}
        {!archived && <Link href={`/projects/${projectId}/review-tasks?concept=${encodeURIComponent(task.concept_key)}`}>{t("Practise this concept")}</Link>}
        {!archived && <Link href={`/projects/${projectId}/suggestions?error=${task.latest_error_id}`}>{t("Suggest review in another project")}</Link>}
        <Link href={`/projects/${projectId}/explore`}>{t("Open free exploration")}</Link>
        {!archived && <Button variant="ghost" disabled={busy} onClick={() => void dismiss(task.latest_error_id)}>{t("Dismiss latest diagnosis")}</Button>}
      </div>
    </article>)}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!archived && (
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <details style={{ display: "inline-block", textAlign: "left" }}>
          <summary
            style={{
              cursor: "pointer",
              color: "var(--sf-accent)",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {t("Record diagnosis")}
          </summary>
          <div style={{ marginTop: 16, minWidth: 400 }}>
            <DiagnosisForm projectId={projectId} />
          </div>
        </details>
      </div>
    )}
  </section>;
}
