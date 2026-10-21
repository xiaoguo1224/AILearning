"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ApiError, recordDiagnosis } from "@/lib/api";
import type { DiagnosisCause } from "@/lib/types";

export const DIAGNOSIS_CAUSES: { value: DiagnosisCause; label: string }[] = [
  { value: "concept_gap", label: "Concept gap" },
  { value: "procedure", label: "Procedure error" },
  { value: "notation", label: "Notation error" },
  { value: "misread", label: "Misread the question" },
  { value: "tooling", label: "Tooling issue" },
  { value: "careless", label: "Careless mistake" },
  { value: "unclassified", label: "Unclassified" },
];

export function DiagnosisForm({ projectId, evidence }: {
  projectId: number; evidence?: { review_id: number; finding_index: number };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const id = useId();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    lock.current = true; setBusy(true); setError(undefined); setMessage(undefined);
    try {
      await recordDiagnosis(projectId, {
        concept_key: String(data.get("concept")).trim(),
        cause: String(data.get("cause")) as DiagnosisCause,
        note: String(data.get("note")), ...evidence,
      });
      setMessage(t("Diagnosis saved. It does not change mastery or run your code."));
      form.reset(); router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not save the diagnosis."));
    } finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className="space-y-3">
    <p className="text-small text-ink-muted">{t(evidence ? "Choose the concept this finding relates to. The saved review supplies the evidence." : "Record your own diagnosis. This is a personal observation, not a verified test result.")}</p>
    <Field id={`${id}-concept`} name="concept" label={t("Knowledge point")} required maxLength={200} disabled={busy} />
    <div>
      <label htmlFor={`${id}-cause`}>{t("Error cause")}</label>
      <select id={`${id}-cause`} name="cause" disabled={busy} className="ml-3 rounded-control border border-line bg-surface p-2">
        {DIAGNOSIS_CAUSES.map(cause => <option key={cause.value} value={cause.value}>{t(cause.label)}</option>)}
      </select>
    </div>
    <Field id={`${id}-note`} name="note" label={t("Note")} maxLength={4000} disabled={busy} />
    <Button type="submit" disabled={busy}>{t(busy ? "Saving…" : "Record diagnosis")}</Button>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {message && <p role="status" className="text-success">{message}</p>}
  </form>;
}
