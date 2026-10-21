"use client";

import { useI18n } from "@/components/LocaleProvider";
import { Callout } from "@/components/ui/Callout";
import { knowledgeKindLabel, knowledgeStatusLabel } from "@/lib/knowledge";
import type { KnowledgeCompare, KnowledgeDiffLine } from "@/lib/types";

/**
 * The line's prefix, which is what carries insert-versus-delete without colour.
 *
 * A two-character prefix rather than a single one, so `+` and `-` rows line up with the
 * untouched ones instead of starting a character to the left of them. The prefixes are
 * NOT aria-hidden: they are the non-colour signal, so a reader who cannot see the tint
 * still needs to hear which side a line is on.
 */
function prefixOf(op: KnowledgeDiffLine["op"]): string {
  if (op === "insert") return "+ ";
  if (op === "delete") return "- ";
  return "  ";
}

const LINE_CLASSES: Record<KnowledgeDiffLine["op"], string> = {
  insert: "bg-success-surface text-success",
  delete: "bg-danger-surface text-danger",
  equal: "text-ink-muted",
  // A gap is an elided run of unchanged text. It gets no tone because it is not a
  // change, and no prefix because it is not a line of the entry.
  gap: "text-center text-ink-subtle",
};

/**
 * One version against the entry as it stands now.
 *
 * WHAT THIS ANSWERS. Not "how do I edit this" — the editor above already shows the text.
 * It answers "is the text still the text I signed off", which is why the default start is
 * the last confirmed version and the end is always the working copy.
 *
 * TRUNCATION IS STATED, NEVER HIDDEN. `truncated` means the diff hit the server's line
 * cap, so the tail below it is NOT unchanged text that happens to be missing: it was
 * never sent. A reader who mistook the cut for the end of the change would approve
 * something they had not read.
 *
 * Title, kind and status changes are named on their own lines because none of them shows
 * up in a line diff of the body, and a kind change from definition to note is a bigger
 * fact than any single edited sentence.
 */
export function KnowledgeDiff({ compare }: { compare: KnowledgeCompare }) {
  const { t } = useI18n();

  return (
    <section aria-labelledby="knowledge-compare-heading" className="space-y-3">
      <h3 id="knowledge-compare-heading" className="text-subtitle">
        {t("v{0} → current", compare.from_version)}
      </h3>

      {compare.from_title !== compare.to_title && (
        <p className="text-small text-ink-muted">
          {t("Title changed from “{0}” to “{1}”.", compare.from_title, compare.to_title)}
        </p>
      )}
      {compare.from_kind !== compare.to_kind && (
        <p className="text-small text-ink-muted">
          {t(
            "Kind changed from {0} to {1}.",
            knowledgeKindLabel(compare.from_kind, t),
            knowledgeKindLabel(compare.to_kind, t),
          )}
        </p>
      )}
      {compare.from_status !== compare.to_status && (
        <p className="text-small text-ink-muted">
          {t(
            "Status changed from {0} to {1}.",
            knowledgeStatusLabel(compare.from_status, t),
            knowledgeStatusLabel(compare.to_status, t),
          )}
        </p>
      )}

      {!compare.changed ? (
        <p className="text-ui text-ink-muted">
          {t("Identical to v{0}.", compare.from_version)}
        </p>
      ) : (
        /*
         * A div with `whitespace-pre`, not a <pre>: each row is a block so the insert and
         * delete tints can fill their own line, and a <pre> may not contain block-level
         * children. The monospace face and the preserved indentation are what a <pre>
         * would have bought, and both are set here.
         */
        <div className="overflow-x-auto rounded-surface border border-line bg-surface-sunken p-4 font-mono text-small leading-relaxed whitespace-pre">
          {compare.lines.map((line, index) =>
            line.op === "gap" ? (
              // Decoration, not content: an ellipsis a screen reader announced as text
              // would read as a paragraph the entry actually contains.
              <span key={index} aria-hidden="true" className={`block ${LINE_CLASSES.gap}`}>
                {line.text}
              </span>
            ) : (
              <span key={index} className={`block ${LINE_CLASSES[line.op]}`}>
                {`${prefixOf(line.op)}${line.text}`}
              </span>
            ),
          )}
        </div>
      )}

      {compare.truncated && (
        <Callout tone="warning">
          {t("This comparison is long, so only the first part of it is shown.")}
        </Callout>
      )}
    </section>
  );
}
