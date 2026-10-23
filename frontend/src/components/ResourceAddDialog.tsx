"use client";

import { useRef, useState } from "react";

import { Alert, Button, Input, Modal, Segmented } from "antd";

import { useI18n } from "@/components/LocaleProvider";
import { addCourseTextResource, addCourseUrlResource, uploadCourseResource } from "@/lib/api";

/** What the server accepts. Kept in one place so the picker and the hint agree. */
const ACCEPTED = ".pdf,.docx,.md,.markdown,.txt";

type Mode = "file" | "text" | "link";

/**
 * "添加资料" as a dialog rather than a form that grows out of the section.
 *
 * The three ways to add a material used to stack vertically inside the
 * reference-materials panel: a file picker, a text box pair and a link pair all
 * on screen at once, which made a five-item list look like a form page and
 * pushed the list itself out of view. One dialog with a mode switch means the
 * learner sees only the fields the chosen kind needs, and the section stays a
 * list.
 */
export function ResourceAddDialog({
  courseId,
  onClose,
  onAdded,
}: {
  courseId: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ready =
    mode === "file" ? file !== null : mode === "text" ? Boolean(textTitle.trim() && textContent.trim()) : Boolean(url.trim());

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "file" && file) {
        await uploadCourseResource(courseId, file);
      } else if (mode === "text") {
        await addCourseTextResource(courseId, textTitle.trim(), textContent);
      } else {
        await addCourseUrlResource(courseId, url.trim(), urlTitle.trim() || undefined);
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not reach the server."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onCancel={() => !busy && onClose()}
      title={t("Add material")}
      width={520}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>,
        <Button key="add" type="primary" loading={busy} disabled={!ready || busy} onClick={() => void submit()}>
          {t("Add material")}
        </Button>,
      ]}
    >
      <div className="mt-2 space-y-4">
        <Segmented<Mode>
          block
          value={mode}
          disabled={busy}
          onChange={(value) => {
            setMode(value);
            setError(null);
          }}
          options={[
            { value: "file", label: t("Upload a file") },
            { value: "text", label: t("Paste text") },
            { value: "link", label: t("Add a link") },
          ]}
        />

        {mode === "file" && (
          <div>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (busy) return;
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
              className={`rounded-control border border-dashed px-4 py-6 text-center transition-colors duration-fast ease-standard ${
                dragging ? "border-accent bg-surface-sunken" : "border-line-strong"
              }`}
            >
              <Button disabled={busy} onClick={() => fileInputRef.current?.click()}>
                {t("Choose a file")}
              </Button>
              <p className="mt-2 break-all text-small text-ink-muted">
                {file ? file.name : t("Drop a file here, or click to choose")}
              </p>
              <p className="mt-1 text-micro text-ink-subtle">{t("PDF, DOCX, Markdown or plain text")}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                // Cleared so picking the same file twice in a row still fires a change.
                event.target.value = "";
                setFile(picked);
              }}
            />
          </div>
        )}

        {mode === "text" && (
          <div className="space-y-2">
            <Input
              value={textTitle}
              onChange={(event) => setTextTitle(event.target.value)}
              placeholder={t("Title")}
              aria-label={t("Title")}
              disabled={busy}
            />
            <Input.TextArea
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
              placeholder={t("Paste the material here")}
              aria-label={t("Paste the material here")}
              rows={8}
              disabled={busy}
            />
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-2">
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              aria-label={t("Link")}
              disabled={busy}
            />
            <Input
              value={urlTitle}
              onChange={(event) => setUrlTitle(event.target.value)}
              placeholder={t("Title (optional)")}
              aria-label={t("Title (optional)")}
              disabled={busy}
            />
          </div>
        )}

        {error && <Alert type="error" showIcon role="alert" message={error} />}
      </div>
    </Modal>
  );
}
