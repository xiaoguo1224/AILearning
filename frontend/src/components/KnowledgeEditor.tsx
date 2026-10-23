"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, updateKnowledge } from "@/lib/api";
import type { KnowledgeDetail, KnowledgeKind } from "@/lib/types";

/**
 * The wire values and the words for them. The value is never shown: "standard_answer" is
 * a column name, not something a learner should have to decode.
 */
const KINDS: { value: KnowledgeKind; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "definition", label: "Definition" },
  { value: "standard_answer", label: "Standard answer" },
];

const CONTROL_CLASSES =
  "mt-1 w-full rounded-control border border-line bg-transparent px-3 py-2 text-ui text-ink " +
  "transition-colors duration-fast ease-standard hover:border-line-hover focus:border-line-hover " +
  "disabled:opacity-60";

/**
 * Edit one entry in place.
 *
 * THE SENT-BACK NOTICE IS THE REASON THIS COMPONENT HOLDS STATE AT ALL. Editing a
 * confirmed entry returns it to `pending_review`, and the server says so on the PATCH
 * response with `sent_back_for_review`. That fact exists on exactly one response — the
 * following GET reports `false` — so a component that saved, refreshed and forgot would
 * leave the badge quietly changing colour with nothing to explain it, which is the one
 * thing the review step exists to prevent. So the response is kept and stated here.
 *
 * A save that changes nothing but the body of a DRAFT stays a draft, and the same notice
 * is not shown: the server only flags the transition it actually made.
 */
export function KnowledgeEditor({
  knowledge,
  readOnly,
}: {
  knowledge: KnowledgeDetail;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const fieldId = useId();
  const [title, setTitle] = useState(knowledge.title);
  const [body, setBody] = useState(knowledge.body);
  const [kind, setKind] = useState<KnowledgeKind>(knowledge.kind);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentBack, setSentBack] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = saving || refreshing;
  const lock = useRef(false);
  const [baseline, setBaseline] = useState(knowledge.updated_at);
  const [conflicted, setConflicted] = useState(false);
  const stale = baseline !== knowledge.updated_at || conflicted;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || pending || readOnly) return;
    if (stale) {
      setError(t("This entry changed. Reload and review it before saving or confirming."));
      return;
    }
    lock.current = true;
    setSaving(true);
    setError(null);
    setSentBack(false);
    setSaved(false);
    try {
      const updated = await updateKnowledge(knowledge.id, { title, body, kind, expected_updated_at: baseline });
      setBaseline(updated.updated_at);
      setSentBack(updated.sent_back_for_review);
      setSaved(!updated.sent_back_for_review);
      // The list's badges, the version list and the comparison are all server-rendered,
      // so none of them is current until this lands.
      startTransition(() => router.refresh());
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflicted(true);
        startTransition(() => router.refresh());
      }
      setError(err instanceof ApiError ? err.message : t("Could not save this entry."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-4">
      {stale && <Callout tone="warning">
        <p>{t("Your draft is preserved. Reloading saved values discards these edits.")}</p>
        <Button type="button" disabled={pending} variant="secondary" onClick={() => {
          setTitle(knowledge.title); setBody(knowledge.body); setKind(knowledge.kind);
          setBaseline(knowledge.updated_at); setConflicted(false); setError(null);
        }}>{t("Discard draft and reload saved values")}</Button>
      </Callout>}
      <div>
        <label htmlFor={`${fieldId}-title`} className="block text-small font-medium text-ink-muted">
          {t("Title")}
        </label>
        <input
          id={`${fieldId}-title`}
          value={title}
          required maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          disabled={readOnly || pending}
          className={CONTROL_CLASSES}
        />
      </div>

      <div>
        <label htmlFor={`${fieldId}-kind`} className="block text-small font-medium text-ink-muted">
          {t("Kind")}
        </label>
        <select
          id={`${fieldId}-kind`}
          value={kind}
          onChange={(event) => setKind(event.target.value as KnowledgeKind)}
          disabled={readOnly || pending}
          className={CONTROL_CLASSES}
        >
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${fieldId}-body`} className="block text-small font-medium text-ink-muted">
          {t("Body")}
        </label>
        <textarea
          id={`${fieldId}-body`}
          value={body}
          required maxLength={40000}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          disabled={readOnly || pending}
          className={CONTROL_CLASSES}
        />
      </div>

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? t("Saving…") : t("Save")}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {sentBack && (
        <Callout tone="warning" role="status">
          {t("This edit sent the entry back for review, so it is no longer treated as confirmed.")}
        </Callout>
      )}

      {saved && (
        <Callout tone="success" role="status">
          {t("Saved.")}
        </Callout>
      )}
    </form>
  );
}
