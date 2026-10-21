import type { Translator } from "./i18n";
import type { BadgeTone } from "@/components/ui/Badge";
import type { KnowledgeProvenanceItem, KnowledgeStatus } from "./types";

/**
 * The three statuses and three kinds in words a reader can act on.
 *
 * Shared rather than written twice because the review screen states the same status in
 * three places — the list badge, the detail badge and the version rows — and a compare
 * result carries the raw wire values as plain strings. Two spellings of "pending review"
 * on one screen would read as two different states.
 *
 * Both take `string` rather than the narrow union: KnowledgeCompare's from_kind and
 * from_status are plain strings off the wire, and narrowing them at the call site would
 * mean casting. An unrecognised value falls through to itself, which is visible rather
 * than silently blank.
 */
export function knowledgeStatusLabel(status: string, t: Translator): string {
  switch (status) {
    case "draft":
      return t("Draft");
    case "pending_review":
      return t("Pending review");
    case "confirmed":
      return t("Confirmed");
    default:
      return status;
  }
}

export function knowledgeKindLabel(kind: string, t: Translator): string {
  switch (kind) {
    case "note":
      return t("Note");
    case "definition":
      return t("Definition");
    case "standard_answer":
      return t("Standard answer");
    default:
      return kind;
  }
}

/**
 * What a status badge should look like.
 *
 * `pending_review` is warning-toned on purpose: it is the one state that is waiting on
 * the reader. `confirmed` is success, `draft` is neutral because a draft is not a
 * shortfall, it is a note nobody has claimed is settled.
 */
export function knowledgeStatusTone(status: KnowledgeStatus): BadgeTone {
  switch (status) {
    case "confirmed":
      return "success";
    case "pending_review":
      return "warning";
    case "draft":
      return "neutral";
  }
}

/** One revision's reason, in words. A version exists because one of these three happened. */
export function knowledgeRevisionReasonLabel(reason: string, t: Translator): string {
  switch (reason) {
    case "created":
      return t("Created");
    case "edited":
      return t("Edited");
    case "confirmed":
      return t("Confirmed");
    default:
      return reason;
  }
}

/**
 * One provenance item as a single readable line, never as raw JSON.
 *
 * A filename with a locator is the common case and reads like a citation: `notes.md ·
 * p.2`, with the separator dropped when the chunker gave no locator, the same way the
 * explore screen's citation chips do it. Everything else falls back to where it came
 * from in plain words, because an entry's provenance is a record of what was on screen
 * and "somewhere in this project" is still more useful than `{"kind":"resource"}`.
 */
export function knowledgeProvenanceLine(item: KnowledgeProvenanceItem, t: Translator): string {
  if (item.lesson_id !== undefined) return t("Lesson {0} · source version {1}", item.lesson_id, item.source_hash?.slice(0, 12) ?? "?");
  if (item.review_id !== undefined) return t("Reference review {0} · source version {1}", item.review_id, item.source_hash?.slice(0, 12) ?? "?");
  if (item.filename) {
    return item.locator ? `${item.filename} · ${item.locator}` : item.filename;
  }
  if (item.session_id !== undefined) return t("From an exploration conversation");
  if (item.submission_id !== undefined) return t("From a submission");
  if (item.resource_id !== undefined) return t("From a project resource");
  return t("Added by hand");
}
