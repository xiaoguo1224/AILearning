"use client";

import { useState, useEffect, useRef } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  listProjectResources,
  uploadProjectResource,
  addUrlResource,
  addTextResource,
  deleteProjectResource,
  searchProjectResources,
} from "@/lib/api";
import type { ResourceSummary, ResourceSearchResult } from "@/lib/types";

export function ProjectResourcesManager({ projectId, isArchived }: { projectId: number; isArchived?: boolean }) {
  const { t } = useI18n();
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ResourceSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Forms state
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadResources = async () => {
    try {
      const data = await listProjectResources(projectId);
      setResources(data);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load resources");
    }
  };

  useEffect(() => {
    let active = true;
    listProjectResources(projectId)
      .then((data) => {
        if (active) setResources(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load resources");
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadProjectResource(projectId, file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadResources();
    } catch (e: unknown) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    try {
      await addUrlResource(projectId, url.trim(), urlTitle.trim() || undefined);
      setUrl("");
      setUrlTitle("");
      await loadResources();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to add URL");
    }
  };

  const handleAddText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textTitle.trim() || !textContent.trim()) return;
    setError(null);
    try {
      await addTextResource(projectId, textTitle.trim(), textContent.trim(), "markdown");
      setTextTitle("");
      setTextContent("");
      await loadResources();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to add text");
    }
  };

  const handleDelete = async (resId: number) => {
    try {
      await deleteProjectResource(projectId, resId);
      await loadResources();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to delete");
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await searchProjectResources(projectId, searchQuery.trim());
      setSearchResults(res);
    } catch (e: unknown) {
      setError((e as Error).message || "Search failed");
    }
  };

  return (
    <section className="space-y-6 rounded-surface border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-title">{t("Resources & Literature")}</h2>
          <p className="text-small text-ink-muted">
            {t("Upload papers, PDFs, DOCX, Markdown, or add web URLs.")}
          </p>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* FTS Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("Search resources...")}
          className="flex-1 rounded-control border border-line bg-transparent px-3 py-1.5 text-ui text-ink"
        />
        <Button type="submit">{t("Search")}</Button>
        {searchResults !== null && (
          <Button variant="ghost" type="button" onClick={() => { setSearchResults(null); setSearchQuery(""); }}>
            {t("Clear search")}
          </Button>
        )}
      </form>

      {/* Search results view */}
      {searchResults !== null && (
        <div className="space-y-3 rounded-surface bg-surface-sunken p-4">
          <h3 className="font-medium text-ui">{t("Search Results")} ({searchResults.length})</h3>
          {searchResults.length === 0 ? (
            <p className="text-small text-ink-muted">{t("No matches found.")}</p>
          ) : (
            <ul className="space-y-2">
              {searchResults.map((item) => (
                <li key={item.chunk_id} className="rounded border border-line bg-surface p-3 text-small">
                  <div className="font-semibold text-ink">
                    {item.filename} <span className="text-ink-muted">({item.locator})</span>
                  </div>
                  <div
                    className="mt-1 text-ink-muted"
                    dangerouslySetInnerHTML={{ __html: item.snippet }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Resource list */}
      <div className="space-y-3">
        {resources.length === 0 ? (
          <p className="text-small text-ink-muted">{t("No resources attached to this project yet.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {resources.map((res) => (
              <li key={res.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>
                  <span className="font-medium text-ink">{res.filename}</span>
                  <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-micro uppercase text-ink-muted">
                    {res.kind}
                  </span>
                  {res.parse_status === "failed" && (
                    <span className="ml-2 text-micro text-danger">(Failed)</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {res.kind !== "url" && (
                    <a
                      href={`/api/resources/${res.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-small text-accent underline"
                    >
                      {t("Download file")}
                    </a>
                  )}
                  {!isArchived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(res.id)}
                    >
                      {t("Remove from project")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upload/Add controls (hidden when archived) */}
      {!isArchived && (
        <div className="grid gap-6 border-t border-line pt-4 sm:grid-cols-3">
          {/* File Upload */}
          <div className="space-y-2">
            <h4 className="text-small font-medium text-ink">{t("Upload file (PDF, DOCX, MD, TXT)")}</h4>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={uploading}
              className="text-small file:mr-2 file:rounded-control file:border-0 file:bg-surface-sunken file:px-2 file:py-1 file:text-small"
              accept=".pdf,.docx,.md,.txt"
            />
            {uploading && <p className="text-micro text-ink-muted">{t("Uploading...")}</p>}
          </div>

          {/* Add URL */}
          <form onSubmit={handleAddUrl} className="space-y-2">
            <h4 className="text-small font-medium text-ink">{t("Add Web URL")}</h4>
            <input
              type="url"
              placeholder={t("Web URL (https://...)")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded border border-line bg-transparent px-2 py-1 text-small"
              required
            />
            <input
              type="text"
              placeholder={t("Title (optional)")}
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              className="w-full rounded border border-line bg-transparent px-2 py-1 text-small"
            />
            <Button size="sm" type="submit">{t("Add URL")}</Button>
          </form>

          {/* Add Text / Note */}
          <form onSubmit={handleAddText} className="space-y-2">
            <h4 className="text-small font-medium text-ink">{t("Add Text / Markdown")}</h4>
            <input
              type="text"
              placeholder={t("Title")}
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              className="w-full rounded border border-line bg-transparent px-2 py-1 text-small"
              required
            />
            <textarea
              placeholder={t("Content")}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="w-full rounded border border-line bg-transparent px-2 py-1 text-small"
              rows={2}
              required
            />
            <Button size="sm" type="submit">{t("Save Text")}</Button>
          </form>
        </div>
      )}
    </section>
  );
}
