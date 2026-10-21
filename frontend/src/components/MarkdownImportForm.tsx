"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { ApiError, importCourseFromMarkdown } from "@/lib/api";

interface PickedFile {
  path: string;
  content: string;
}

/**
 * Create a course from a local markdown folder — no AI generation. The folder
 * contract: subfolders become modules, .md files become lessons, numeric
 * prefixes ("01-") set the order. See docs/markdown-import.md.
 */
export function MarkdownImportForm() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    setError(null);
    if (!list || list.length === 0) return;
    const picked: PickedFile[] = [];
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!rel.toLowerCase().endsWith(".md") && !rel.toLowerCase().endsWith("course.json")) {
        continue;
      }
      if (file.size > 200_000) {
        setError(t("File {0} is larger than 200 KB and was skipped.", rel));
        continue;
      }
      picked.push({ path: rel, content: await file.text() });
    }
    if (picked.length === 0) {
      setError(t("No markdown files found in that folder."));
      return;
    }
    const root = picked[0].path.split("/")[0] || "";
    setFolderName(root);
    setFiles(picked);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await importCourseFromMarkdown(files);
      router.push(`/courses/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Import failed."));
    } finally {
      setBusy(false);
    }
  }

  const mdCount = files.filter((f) => f.path.toLowerCase().endsWith(".md")).length;

  return (
    <div className="mt-10 rounded-surface border border-line bg-surface p-6">
      <h2 className="text-subtitle font-semibold">{t("Import from a markdown folder")}</h2>
      <p className="mt-1 text-small text-ink-muted">
        {t("Pick a folder of .md files. Subfolders become chapters, files become lessons — no AI generation.")}
      </p>

      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in the DOM types but works in Chromium
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-control border border-line-strong px-4 py-2 text-ui"
      >
        {t("Choose folder…")}
      </button>

      {files.length > 0 && (
        <div className="mt-4">
          <p className="text-small text-ink-muted">
            {t("{0}: {1} markdown files", folderName, mdCount)}
          </p>
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-control border border-line bg-surface-sunken p-3 font-mono text-small">
            {files
              .filter((f) => f.path.toLowerCase().endsWith(".md"))
              .slice(0, 50)
              .map((f) => (
                <li key={f.path} className="truncate py-0.5">
                  {f.path}
                </li>
              ))}
          </ul>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-4 rounded-control bg-accent px-4 py-2 text-ui font-medium text-white disabled:opacity-50"
          >
            {busy ? t("Importing…") : t("Import {0} files", mdCount)}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
