"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
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
export function SubmissionForm({ projectId }: { projectId: number }) {
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

      <div className="flex gap-2" role="tablist" aria-label={t("Submission method")}>
        {(["paste", "upload"] as Mode[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-control px-3 py-1 text-small ${
              mode === value
                ? "bg-surface-sunken font-medium text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {value === "paste" ? t("Paste code") : t("Upload files")}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}
      {done && !error && (
        <p className="text-small text-success">{t("Submission saved. Review it below.")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL}>{t("Exercise or knowledge point (optional)")}</span>
          <input
            className={INPUT}
            value={exerciseId}
            onChange={(event) => setExerciseId(event.target.value)}
            placeholder="tensor-broadcast-01"
            maxLength={100}
          />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>{t("Note for yourself (optional)")}</span>
          <input
            className={INPUT}
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
            <input
              className={INPUT}
              value={codeName}
              onChange={(event) => setCodeName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Code")}</span>
            <textarea
              className={`${INPUT} font-mono`}
              rows={10}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Log filename (optional)")}</span>
            <input
              className={INPUT}
              value={logName}
              onChange={(event) => setLogName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="space-y-1">
            <span className={LABEL}>{t("Terminal output or traceback (optional)")}</span>
            <textarea
              className={`${INPUT} font-mono`}
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
            <span className={LABEL}>{t("Code file (.py, .txt, .md)")}</span>
            <input
              type="file"
              accept=".py,.txt,.md,.json,.yaml,.yml"
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
            {t("Code up to 512 KB, logs up to 2 MB. Text only; archives and binaries are refused.")}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending || !hasInput}>
        {pending ? t("Saving...") : t("Save submission")}
      </Button>
    </form>
  );
}
