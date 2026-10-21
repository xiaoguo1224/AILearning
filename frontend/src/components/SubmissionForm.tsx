"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Input, Segmented } from "antd";
import { ErrorState } from "@/components/ui/ErrorState";
import { createSubmission, uploadSubmission } from "@/lib/api";

type Mode = "paste" | "upload";

const INPUT =
  "w-full rounded-control border border-line bg-transparent px-3 py-1.5 text-ui text-ink placeholder:text-ink-muted";
const LABEL = "block text-small font-medium text-ink";

/**
 * One submission at a time, pasted or uploaded. Nothing here runs the code: the form
 * only hands text to the server, which stores it and analyses it statically.
 */
export function SubmissionForm({
  projectId,
  variantId,
}: {
  projectId: number;
  /** Set when the learner arrived from a drafted variant, so the resubmission links back. */
  variantId?: number;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("paste");
  const [exerciseId, setExerciseId] = useState("");
  const [note, setNote] = useState("");
  const [codeName, setCodeName] = useState("solution.py");
  const [code, setCode] = useState("");
  const [logName, setLogName] = useState("run.log");
  const [log, setLog] = useState("");
  const [codeFile, setCodeFile] = useState<File | null>(null);
  const [logFile, setLogFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasInput =
    mode === "paste" ? Boolean(code.trim() || log.trim()) : Boolean(codeFile || logFile);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !hasInput) return;
    setPending(true);
    setError(null);
    setDone(false);
    try {
      if (mode === "paste") {
        await createSubmission(projectId, {
          exercise_id: exerciseId.trim() || undefined,
          variant_id: variantId,
          user_note: note.trim() || undefined,
          code_filename: codeName.trim() || "solution.py",
          code_content: code.trim() ? code : undefined,
          log_filename: log.trim() ? logName.trim() || "run.log" : undefined,
          log_content: log.trim() ? log : undefined,
        });
        setCode("");
        setLog("");
      } else {
        await uploadSubmission(projectId, {
          codeFile,
          logFile,
          exerciseId,
          variantId,
          userNote: note,
        });
        setCodeFile(null);
        setLogFile(null);
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      // Keep every field as typed: a refused upload is usually a size or type problem
      // the learner fixes and resubmits.
      setError(err instanceof Error ? err.message : t("Could not save this submission."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-surface border border-line p-6">
      <div>
        <h2 className="text-title">{t("Submit code for review")}</h2>
        <p className="text-small text-ink-muted">
          {t(
            "Run the code on your own machine, then upload the file and the log. The server stores and analyses them; it never runs them.",
          )}
        </p>
      </div>

      <Segmented
        aria-label={t("Submission method")}
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        options={[
          { label: t("Paste code"), value: "paste" },
          { label: t("Upload files"), value: "upload" },
        ]}
      />

      {variantId && (
        <p className="text-small text-ink-muted">
          {t("This submission will be linked to variant draft #{0}.", variantId)}
        </p>
      )}

      {error && <ErrorState message={error} />}
      {done && !error && (
        <p className="text-small text-success">{t("Submission saved. Review it below.")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL}>{t("Exercise or knowledge point (optional)")}</span>
          <Input
            value={exerciseId}
            onChange={(event) => setExerciseId(event.target.value)}
            placeholder="tensor-broadcast-01"
            maxLength={100}
          />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>{t("Note for yourself (optional)")}</span>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
          />
        </label>
      </div>

      {mode === "paste" ? (
        <div className="grid gap-4">
          <label className="space-y-1">
            <span className={LABEL}>{t("Code filename")}</span>
            <Input
              value={codeName}
              onChange={(event) => setCodeName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Code")}</span>
            <Input.TextArea
              style={{ fontFamily: "monospace" }}
              rows={10}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Log filename (optional)")}</span>
            <Input
              value={logName}
              onChange={(event) => setLogName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Terminal output or traceback (optional)")}</span>
            <Input.TextArea
              style={{ fontFamily: "monospace" }}
              rows={6}
              value={log}
              onChange={(event) => setLog(event.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={LABEL}>{t("Code file (.py, .txt, .md, .zip)")}</span>
            <input
              type="file"
              accept=".py,.txt,.md,.json,.yaml,.yml,.zip"
              onChange={(event) => setCodeFile(event.target.files?.[0] ?? null)}
              className="text-small"
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Log file (.log, .txt, .out)")}</span>
            <input
              type="file"
              accept=".log,.txt,.out,.err,.md"
              onChange={(event) => setLogFile(event.target.files?.[0] ?? null)}
              className="text-small"
            />
          </label>
          <p className="text-micro text-ink-muted sm:col-span-2">
            {t("Code up to 512 KB, logs up to 2 MB. A .zip is unpacked into one code file per member (max 50 files, 2 MB total); binaries are refused.")}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending || !hasInput}>
        {pending ? t("Saving...") : t("Save submission")}
      </Button>
    </form>
  );
}
