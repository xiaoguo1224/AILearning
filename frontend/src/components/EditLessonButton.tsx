"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TextAreaRef } from "antd/es/input/TextArea";

import { Alert, Button as AntButton, Form, Input, Modal } from "antd";
import { useI18n } from "@/components/LocaleProvider";
import { ApiError, attachmentUrl, patchLesson, uploadAttachment } from "@/lib/api";

/**
 * Manual editing for a lesson's title, content and concepts. Opens a dialog
 * with the current values; saving PATCHes /api/lessons/{id} and refreshes.
 */
export function EditLessonButton({
  lessonId,
  initialTitle,
  initialContent,
  initialConcepts,
}: {
  lessonId: number;
  initialTitle: string;
  initialContent: string;
  initialConcepts: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [concepts, setConcepts] = useState(initialConcepts.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<TextAreaRef>(null);
  const selection = useRef({ start: initialContent.length, end: initialContent.length });

  async function insertImages(files: File[], pastedText = "") {
    if (!files.length || uploadingRef.current || busy) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    const position = { ...selection.current };
    const images: string[] = [];
    let failed = false;
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024 || (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
          failed = true;
          continue;
        }
        try {
          const result = await uploadAttachment(file);
          if (result.kind !== "image") throw new Error("not an image");
          images.push(`![${t("Image")}](${attachmentUrl(result.id)})`);
        } catch {
          failed = true;
        }
      }
      if (images.length || pastedText) {
        const inserted = pastedText + (images.length ? `\n\n${images.join("\n\n")}\n\n` : "");
        setContent((current) => current.slice(0, position.start) + inserted + current.slice(position.end));
        selection.current = { start: position.start + inserted.length, end: position.start + inserted.length };
      }
      if (failed) setError(t("Some images could not be uploaded. Use PNG, JPEG or WebP, up to 10 MB each."));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  async function save() {
    if (!title.trim()) {
      setError(t("Title cannot be empty."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchLesson(lessonId, {
        title: title.trim(),
        content,
        concepts: concepts
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AntButton
        onClick={() => {
          setTitle(initialTitle);
          setContent(initialContent);
          selection.current = { start: initialContent.length, end: initialContent.length };
          setConcepts(initialConcepts.join(", "));
          setError(null);
          setOpen(true);
        }}
        className="rounded-control border border-line px-4 py-2 text-ui text-ink-muted transition-colors hover:text-ink"
      >
        {t("Edit")}
      </AntButton>
      <Modal
        open={open}
        onCancel={() => { if (!uploading && !busy) setOpen(false); }}
        closable={!uploading && !busy}
        mask={{ closable: !uploading && !busy }}
        keyboard={!uploading && !busy}
        title={t("Edit lesson")}
        width={800}
        footer={[
          <AntButton key="cancel" disabled={uploading || busy} onClick={() => setOpen(false)}>
            {t("Cancel")}
          </AntButton>,
          <AntButton key="save" type="primary" loading={busy} disabled={uploading} onClick={save}>
            {busy ? t("Saving…") : t("Save")}
          </AntButton>,
        ]}
      >
        <Form layout="vertical">
          <Form.Item label={t("Title")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Form.Item>
          <Form.Item label={t("Concepts (comma-separated)")}>
            <Input value={concepts} onChange={(e) => setConcepts(e.target.value)} />
          </Form.Item>
          <Form.Item label={t("Content (markdown)")}>
            <Input.TextArea
              ref={editor}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                selection.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
              }}
              onSelect={(e) => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                  void insertImages(files, e.clipboardData.getData("text/plain"));
                }
              }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files);
                if (files.length) { e.preventDefault(); void insertImages(files); }
              }}
              readOnly={uploading || busy}
              rows={18}
              style={{ fontFamily: "monospace" }}
            />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              void insertImages(files);
            }} />
            <AntButton disabled={uploading || busy} onClick={() => fileInput.current?.click()}>{t("Insert image")}</AntButton>
            <span className="ml-2 text-small text-ink-muted" role="status">{uploading ? t("Uploading…") : t("Paste, drag or choose PNG, JPEG or WebP images (up to 10 MB each).")}</span>
          </Form.Item>
          {error && <Alert type="error" title={error} showIcon />}
        </Form>
      </Modal>
    </>
  );
}
