"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Empty } from "antd";
import { Badge } from "@/components/ui/Badge";
import { ApiError, createSuggestion, decideSuggestion, listProjects } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";
import type { ProjectList, ProjectReviewTask, SuggestionList } from "@/lib/types";

export function SuggestionsPanel({ projectId, suggestions, source, initialChoices }: {
  projectId: number; suggestions: SuggestionList; source?: ProjectReviewTask; initialChoices: ProjectList;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [choices, setChoices] = useState(initialChoices.items);
  const [offset, setOffset] = useState(initialChoices.items.length);
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined); setNotice(undefined);
    try { await action(); setNotice(t(message)); router.refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("Could not save the suggestion.")); }
    finally { lock.current = false; setBusy(false); }
  }
  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = Number(new FormData(event.currentTarget).get("target"));
    if (source) void mutate(async () => {
      const created = await createSuggestion(projectId, source.latest_error_id, target);
      if (created.state !== "pending") throw new ApiError(409, t("This suggestion has already been decided."));
    }, "Suggestion saved for confirmation. The target project is unchanged.");
  }
  async function more() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try {
      const next = await listProjects("active", offset);
      setChoices(current => [...current, ...next.items.filter(item => !current.some(known => known.id === item.id))]);
      setOffset(offset + next.items.length);
    } catch (err) { setError(err instanceof ApiError ? err.message : t("Could not load project choices.")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-6">
    <p>{t("A suggestion changes the target project only when you accept it. Rejecting keeps its learning data unchanged.")}</p>
    {source && <form onSubmit={propose} className="space-y-3 rounded-surface border border-line p-4">
      <h2 className="text-title">{source.concept_label}</h2>
      <p className="whitespace-pre-wrap">{source.latest_note}</p>
      <label className="block">{t("Target project")}<select name="target" required disabled={busy} className="ml-3 rounded-control border border-line bg-surface p-2" defaultValue="">
        <option value="" disabled>{t("Choose a project")}</option>
        {choices.filter(project => project.id !== projectId).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>
      {offset < initialChoices.total && <Button type="button" variant="secondary" disabled={busy} onClick={() => void more()}>{t("More projects")}</Button>}
      <Button type="submit" disabled={busy}>{t("Propose review")}</Button>
    </form>}
    {suggestions.items.length === 0 && (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <span style={{ color: "var(--sf-ink-muted)" }}>
            {t("No cross-project suggestions yet.")}
          </span>
        }
        style={{ padding: "60px 0" }}
      />
    )}
    {suggestions.items.map(item => <article key={item.id} className="space-y-3 rounded-surface border border-line p-4">
      <h2 className="text-title">{item.concept_label}</h2>
      <p><Link className="text-accent underline" href={`/projects/${item.source_project_id}`}>{item.source_name}</Link> → <Link className="text-accent underline" href={`/projects/${item.target_project_id}`}>{item.target_name}</Link></p>
      <Badge>{t(item.state === "pending" ? "Awaiting confirmation" : item.state === "accepted" ? "Accepted" : "Rejected")}</Badge>
      {item.decided_at && <p className="text-small text-ink-muted">{t("Decided {0}", formatDateTime(item.decided_at, t.locale))}</p>}
      <details><summary>{t("Source evidence")}</summary><pre className="whitespace-pre-wrap break-words text-small">{item.evidence}</pre></details>
      {item.state === "pending" && <div className="flex flex-wrap gap-3">
        <p>{t("Accepting adds a review task for {0} in {1}.", item.concept_label, item.target_name)}</p>
        <Button disabled={busy} onClick={() => void mutate(() => decideSuggestion(item.id, "accepted"), "Suggestion accepted. A review task was added to the target project.")}>{t("Accept suggestion")}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void mutate(() => decideSuggestion(item.id, "rejected"), "Suggestion rejected. The target project is unchanged.")}>{t("Reject suggestion")}</Button>
      </div>}
      {item.target_error_id && <Link className="text-accent underline" href={`/projects/${item.target_project_id}/review-tasks`}>{t("Open target review tasks")}</Link>}
    </article>)}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
  </section>;
}
