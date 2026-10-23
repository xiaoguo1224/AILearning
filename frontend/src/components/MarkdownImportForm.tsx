"use client";

import { useRef, useState } from "react";
import { Button } from "antd";
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
 *
 * `bare` drops the surrounding card and its heading, for use inside a tab that
 * already names the panel. The folder-structure reference stays in both modes:
 * it is the only place the contract is explained in the product itself, and the
 * import is the one action here a learner cannot undo by guessing.
 */
export function MarkdownImportForm({ bare = false }: { bare?: boolean }) {
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
    <div className={bare ? "" : "mt-10 rounded-surface border border-line bg-surface p-6"}>
      {!bare && (
        <h2 className="text-subtitle font-semibold">{t("Import from a markdown folder")}</h2>
      )}
      <p className={`${bare ? "" : "mt-1 "}text-small text-ink-muted`}>
        {t("Pick a folder of .md files. Subfolders become chapters, files become lessons — no AI generation.")}
      </p>

      <FolderStructureReference />

      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in the DOM types but works in Chromium
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={onPick}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        style={{ marginTop: 16 }}
      >
        {t("Choose folder…")}
      </Button>

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
          <Button
            onClick={submit}
            disabled={busy}
            type="primary"
            style={{ marginTop: 16 }}
          >
            {busy ? t("Importing…") : t("Import {0} files", mdCount)}
          </Button>
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

/**
 * The folder contract, shown where the folder is picked.
 *
 * Collapsed by default: the common case is a learner who already knows the layout
 * and only wants the button. It stays in the DOM either way, so the contract is one
 * click away instead of living only in docs/markdown-import.md. The tree is the
 * whole point — prose rules alone leave people guessing how deep subfolders go.
 */
function FolderStructureReference() {
  const { t } = useI18n();
  return (
    <details className="mt-4 rounded-control border border-line bg-surface-sunken px-4 py-3">
      <summary className="cursor-pointer select-none text-small font-medium text-ink">
        {t("Folder structure reference")}
      </summary>
      <pre className="mt-3 overflow-x-auto font-mono text-small leading-relaxed text-ink-muted">
{`my-course/
├── course.json
├── 01-第一章/
│   ├── 01-注意力机制.md
│   └── 02-多头注意力.md
├── 02-第二章/
│   └── 01-位置编码.md
└── 附录.md`}
      </pre>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-small text-ink-muted">
        <li>{t("Subfolders become chapters, .md files become lessons.")}</li>
        <li>{t("A leading number like 01- sets the order and is hidden from the title.")}</li>
        <li>{t("course.json is optional. It carries the course title and description.")}</li>
        <li>{t("Non-markdown files are skipped. Up to 100 files, 200 KB each.")}</li>
      </ul>
    </details>
  );
}
