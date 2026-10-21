"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button as AntButton, Form, Input, Modal } from "antd";
import { useI18n } from "@/components/LocaleProvider";
import { ApiError, patchCourse } from "@/lib/api";

/** Manual editing for a course's title and description. */
export function EditCourseButton({
  courseId,
  initialTitle,
  initialDescription,
}: {
  courseId: number;
  initialTitle: string;
  initialDescription: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
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
      await patchCourse(courseId, { title: title.trim(), description });
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
          setDescription(initialDescription);
          setError(null);
          setOpen(true);
        }}
        className="rounded-control border border-line px-3 py-1.5 text-small text-ink-muted transition-colors hover:text-ink"
      >
        {t("Edit")}
      </AntButton>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={t("Edit course")}
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
          <Form.Item label={t("Description")}>
            <Input.TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </Form.Item>
          {error && <Alert type="error" message={error} showIcon />}
        </Form>
      </Modal>
    </>
  );
}
