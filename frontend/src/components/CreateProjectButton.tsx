"use client";

import { Button, Form, Input, Modal, Select } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { ApiError, createProject } from "@/lib/api";

/**
 * "Create project" button that opens a modal dialog.
 */
export function CreateProjectButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState("course");

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        goal: goal.trim() || "",
        mode: mode as "course",
      });
      setOpen(false);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not create project."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)}>
        {t("Create project")}
      </Button>
      <Modal
        open={open}
        onCancel={() => !busy && setOpen(false)}
        title={t("Create project")}
        footer={[
          <Button key="cancel" onClick={() => setOpen(false)} disabled={busy}>
            {t("Cancel")}
          </Button>,
          <Button
            key="create"
            type="primary"
            loading={busy}
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
          >
            {t("Create")}
          </Button>,
        ]}
      >
        <Form layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label={t("Project name")} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Give your project a name")}
              disabled={busy}
            />
          </Form.Item>
          <Form.Item label={t("Learning goal")}>
            <Input.TextArea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("What do you want to achieve?")}
              rows={3}
              disabled={busy}
            />
          </Form.Item>
          <Form.Item label={t("Initial template")}>
            <Select
              value={mode}
              onChange={setMode}
              disabled={busy}
              options={[{ value: "course", label: t("Course learning") }]}
            />
          </Form.Item>
          {error && <p style={{ color: "#f5222d", fontSize: 13 }}>{error}</p>}
        </Form>
      </Modal>
    </>
  );
}
