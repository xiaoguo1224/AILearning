"use client";

import { Input } from "antd";
import { useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import type { LessonDraft } from "@/lib/api";

/**
 * An editable preview of a regenerated lesson draft.
 *
 * The learner can tweak the draft before deciding: 采用 saves the edited
 * version, 不采用 discards it. "章节支持自己修改" lives here — the draft is
 * a starting point, not a take-it-or-leave-it.
 */
export function RegenDraftPreview({
  draft,
  onAdopt,
  onDiscard,
  adopting,
}: {
  draft: LessonDraft;
  onAdopt: (edited: LessonDraft) => void;
  onDiscard: () => void;
  adopting: boolean;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [concepts, setConcepts] = useState(draft.concepts.join(", "));
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-control border border-line bg-surface-sunken p-4">
      {editing ? (
        <div className="space-y-3">
          <label className="block text-small font-medium">
            {t("Title")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={adopting}
              className="mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
            />
          </label>
          <label className="block text-small font-medium">
            {t("Concepts (comma separated)")}
            <input
              value={concepts}
              onChange={(e) => setConcepts(e.target.value)}
              disabled={adopting}
              className="mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 text-small"
            />
          </label>
          <label className="block text-small font-medium">
            {t("Content")}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              disabled={adopting}
              className="mt-1 block w-full rounded-control border border-line bg-surface px-3 py-2 font-mono text-small"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            {t("Preview")}
          </Button>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-ui font-semibold">{title}</h4>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("Edit")}
            </Button>
          </div>
          {concepts.trim() && (
            <p className="mt-1 text-small text-ink-muted">
              {concepts.split(",").map((c) => c.trim()).filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-3 max-h-96 overflow-y-auto">
            <LessonMarkdown content={content} title={title} />
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={adopting} onClick={onDiscard}>
          {t("Discard")}
        </Button>
        <Button
          size="sm"
          disabled={adopting}
          onClick={() =>
            onAdopt({
              title,
              content,
              concepts: concepts.split(",").map((c) => c.trim()).filter(Boolean),
            })
          }
        >
          {adopting ? t("Adopting…") : t("Adopt")}
        </Button>
      </div>
    </div>
  );
}
