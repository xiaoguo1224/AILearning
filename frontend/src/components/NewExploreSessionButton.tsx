"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ApiError, createProjectSession } from "@/lib/api";

/**
 * Start an empty session and open it.
 *
 * A client component rather than a server action because the new session's id is only
 * known from the response, and the page is addressed by `?session=<id>`. Pushing that
 * URL is what makes the server render the empty conversation; nothing is written beyond
 * the session row itself.
 *
 * The caller renders this only for an active project. An archived one answers 409
 * `project_archived`, which is shown in the server's own words if it happens anyway.
 */
export function NewExploreSessionButton({ projectId, draft, label }: { projectId: number; draft?: string; label?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const session = await createProjectSession(projectId);
      // A new id, so this is a real navigation and the server renders the new session.
      router.push(`/projects/${projectId}/explore?session=${session.id}${draft ? `&draft=${encodeURIComponent(draft.slice(0, 2000))}` : ""}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not start a session."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={() => void start()} disabled={pending}>
        {pending ? t("Starting…") : label ?? t("New session")}
      </Button>
      {error && <span className="text-small text-danger">{error}</span>}
    </div>
  );
}
