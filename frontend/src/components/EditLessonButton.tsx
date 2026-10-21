"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button as AntButton, Form, Input, Modal } from "antd";
import { useI18n } from "@/components/LocaleProvider";
import { ApiError, patchLesson } from "@/lib/api";

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
        onCancel={() => setOpen(false)}
        title={t("Edit lesson")}
        width={800}
        footer={[
          <AntButton key="cancel" onClick={() => setOpen(false)}>
            {t("Cancel")}
          </AntButton>,
          <AntButton key="save" type="primary" loading={busy} onClick={save}>
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={18}
              style={{ fontFamily: "monospace" }}
            />
          </Form.Item>
          {error && <Alert type="error" message={error} showIcon />}
        </Form>
      </Modal>
    </>
  );
}
