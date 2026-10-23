"use client";

import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, attachmentUrl, uploadAttachment, type UploadedAttachment } from "@/lib/api";

/** The server's own cap. Checked here too so the learner hears about it immediately. */
const MAX_ATTACHMENTS = 5;
/** Mirrors `attachments.storage.MAX_BYTES`; the server is still the one that enforces it. */
const MAX_MB = 10;

/**
 * A text box with an upload area under it.
 *
 * Not a rich-text editor on purpose: a contenteditable would let a picture sit between
 * two words, at the cost of owning caret restoration, IME handling and HTML sanitising
 * forever. A short answer is prose plus evidence, so the evidence gets its own list
 * below the box — one row per file, with the filename and a mark that it landed.
 *
 * Paste and drop are both wired because that is how a screenshot actually arrives: a
 * learner who has just written an answer on paper photographs it and presses Ctrl+V.
 */
export function AttachmentInput({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  disabled,
  placeholder,
  labelledBy,
  onError,
  textareaRef,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  attachments: UploadedAttachment[];
  onAttachmentsChange: (next: UploadedAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  labelledBy?: string;
  onError: (message: string) => void;
  /**
   * The caller owns focus here: a graded submission disables this box and blurs it to
   * the body, and the page's focus-restoration effect has to put the learner back.
   */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  /**
   * Enter inserts a newline (this is prose, not a one-word answer), so the keyboard
   * route to submitting is Ctrl/Cmd+Enter — the same shortcut the code answer uses.
   */
  onSubmit?: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0);
  const [dragging, setDragging] = useState(false);
  /**
   * The uploads are async and the parent re-renders between them, so the `attachments`
   * this closure captured can be one upload stale. This ref always holds the latest.
   *
   * It is written from two places, never from render: `addFiles` assigns it the moment
   * it hands a new list to the parent (that is the only place that knows the truth
   * while uploads are in flight), and the effect below adopts whatever the parent
   * replaced the list with — a restored submitted answer, or a cleared box after
   * submit — but only once nothing is pending, so an in-flight upload cannot be
   * clobbered by a prop that is already behind.
   */
  const latest = useRef(attachments);
  useEffect(() => {
    if (pending === 0) latest.current = attachments;
  }, [attachments, pending]);

  async function addFiles(files: File[]) {
    for (const file of files) {
      if (latest.current.length + pending >= MAX_ATTACHMENTS) {
        onError(t("You can attach at most {0} files.", MAX_ATTACHMENTS));
        return;
      }
      setPending((count) => count + 1);
      try {
        const uploaded = await uploadAttachment(file);
        // A content-addressed upload of the same file twice returns the same id, so a
        // duplicate would render twice and count twice against the cap.
        if (latest.current.some((row) => row.id === uploaded.id)) continue;
        const next = [...latest.current, uploaded];
        latest.current = next;
        onAttachmentsChange(next);
      } catch (err) {
        onError(err instanceof ApiError ? err.message : t("Upload failed."));
      } finally {
        setPending((count) => count - 1);
      }
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    // Only preventDefault when there ARE files: a plain text paste must reach the
    // textarea exactly as it always did.
    event.preventDefault();
    void addFiles(files);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    setDragging(false);
    void addFiles(files);
  }

  return (
    <div className="mt-3">
      <div
        className={`rounded-control border bg-transparent transition-colors duration-fast ease-standard focus-within:border-accent ${
          disabled ? "border-line opacity-60" : "border-line-strong hover:border-line-hover"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onSubmit?.();
            }
          }}
          placeholder={placeholder ?? t("Your answer")}
          aria-labelledby={labelledBy}
          rows={3}
          className="block w-full resize-y bg-transparent px-3 py-2 text-ui text-ink placeholder:text-ink-subtle focus:outline-none"
        />
      </div>

      {/*
        The upload area is its own block under the box, in the shape a file list is
        usually drawn: a button, a line saying what is accepted, then one row per
        file with its name and a success mark. It used to be a strip of chips INSIDE
        the text box, which read as decoration attached to the answer rather than as
        files that were actually uploaded — a learner could not tell whether the
        thing had gone through.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          onDrop(event);
        }}
        className={`mt-2 rounded-control border px-3 py-2.5 transition-colors duration-fast ease-standard ${
          dragging ? "border-accent bg-surface-sunken" : "border-line"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
            {t("Click to upload")}
          </Button>
          <span className="text-small text-ink-muted">
            {pending > 0 ? t("Uploading…") : t("Paste a screenshot or drop a file")}
          </span>
        </div>
        <p className="mt-1.5 text-micro text-ink-subtle">
          {t("PDF, DOCX, Markdown or images — up to {0} files, {1}MB each", MAX_ATTACHMENTS, MAX_MB)}
        </p>

        {attachments.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {attachments.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-surface-sunken"
              >
                <FileGlyph />
                {/*
                  The row OPENS the file. It used to be inert: a learner who had just
                  attached a scan could see a filename and nothing else, and after
                  submitting they could not tell what they had answered with at all.
                  Opening in a new tab keeps the half-written answer on the page.
                */}
                <a
                  href={attachmentUrl(row.id)}
                  target="_blank"
                  rel="noreferrer"
                  title={t("Open {0}", row.filename || t("attachment"))}
                  className="min-w-0 flex-1 truncate text-small !text-black underline-offset-2 hover:text-accent hover:underline"
                >
                  {row.filename || t("Untitled")}
                </a>
                <UploadedMark />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onAttachmentsChange(attachments.filter((item) => item.id !== row.id))
                  }
                  aria-label={t("Remove {0}", row.filename || t("attachment"))}
                  className="rounded px-1 text-small text-ink-muted hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared so picking the same file twice in a row still fires a change.
            event.target.value = "";
            if (files.length > 0) void addFiles(files);
          }}
        />
      </div>
    </div>
  );
}

/** A page with a folded corner: the generic "this is a document" glyph. */
function FileGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      className="shrink-0 text-ink-muted"
    >
      <path d="M9.4 1.8H4.6a1 1 0 0 0-1 1v10.4a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V4.6z" />
      <path d="M9.4 1.8v2.8h2.9" />
    </svg>
  );
}

/**
 * The upload already succeeded — this is a receipt, not a control, so it stays out
 * of the accessibility tree. The filename next to it carries the meaning.
 */
function UploadedMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-success"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="m5.3 8.2 1.8 1.8 3.6-3.9" />
    </svg>
  );
}
