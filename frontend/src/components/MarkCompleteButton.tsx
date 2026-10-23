"use client";



import { useI18n } from "@/components/LocaleProvider";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Button as AntButton } from "antd";
import { ApiError, completeLesson, uncompleteLesson } from "@/lib/api";

export function MarkCompleteButton({
  lessonId,
  completed,
}: {
  lessonId: number;
  completed: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pending = saving || refreshing;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toggledRef = useRef(false);

  // router.refresh() drops focus to the body even though React reuses this node, so a
  // keyboard user who toggles by mistake cannot immediately toggle back. Restore focus
  // once the refreshed state lands, but only after an actual toggle: focusing on first
  // render would steal focus from wherever the reader actually is.
  useEffect(() => {
    if (!toggledRef.current || pending) return;
    toggledRef.current = false;
    buttonRef.current?.focus();
  }, [completed, pending]);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    toggledRef.current = true;
    try {
      await action();
      // A state update after await is not automatically part of a transition.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Could not reach the server."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {completed ? (
        <AntButton
          ref={buttonRef}
          onClick={() => void run(() => uncompleteLesson(lessonId))}
          disabled={pending}
          aria-label={t("Mark this lesson as not complete")}
          color="green"
          variant="filled"
          className="group"
          /*
            antd's filled green is the app's only success-tinted fill; our own Button
            deliberately has no status-coloured variant, so this one control drops to
            AntButton. `group` is load-bearing rather than decorative: the Undo hint
            below is revealed by group-hover / group-focus-visible, and without the
            class it stays at opacity 0 with no way to appear.
          */
        >
          {pending ? (
            t("Reopening…")
          ) : (
            <>
              {t("✓ Completed")}<span className="ml-2 text-small font-normal opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {t("Undo")}</span>
            </>
          )}
        </AntButton>
      ) : (
        <Button
          ref={buttonRef}
          variant="secondary"
          onClick={() => void run(() => completeLesson(lessonId))}
          disabled={pending}
        >
          {pending ? t("Saving…") : t("Mark complete")}
        </Button>
      )}
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
