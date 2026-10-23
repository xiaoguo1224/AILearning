"use client";

import { useState } from "react";

import { MarkdownImportForm } from "@/components/MarkdownImportForm";
import { StagedGenerateWizard } from "@/components/StagedGenerateWizard";
import { useI18n } from "@/components/LocaleProvider";

/**
 * The two ways to create a course, as tabs instead of one stacked page.
 *
 * They used to sit on top of each other, which read as one long form: the import
 * panel's heading looked like a section of the generation wizard, and a learner who
 * wanted to import a folder had to scroll past the whole wizard to find it. The two
 * paths are alternatives, not steps, so they get a tab each.
 */
export type CreateCourseMode = "generate" | "import";

/**
 * Same underline treatment as CourseTabs: `border-accent` is the one sanctioned use
 * of the accent for an active tab indicator, per globals.css's type-scale comment.
 */
const TAB_CLASS =
  "-mb-px border-b-2 pb-2.5 text-small transition-colors duration-fast ease-standard";
const ACTIVE_CLASS = "border-accent font-semibold";
const INACTIVE_CLASS = "border-transparent text-ink-muted hover:text-ink";

export function CreateCourseTabs({ initialJobId }: { initialJobId?: string }) {
  const { t } = useI18n();
  // Generation is the default: it is the path that needs material picked before it
  // can do anything, so it is where a learner arriving with nothing selected starts.
  // A `?job=` handoff always lands here too, since that job IS a generation run.
  const [mode, setMode] = useState<CreateCourseMode>("generate");

  const tabs: { id: CreateCourseMode; label: string }[] = [
    { id: "generate", label: t("Generate with AI") },
    { id: "import", label: t("Import from a folder") },
  ];

  return (
    <div>
      <nav aria-label={t("How to create the course")} className="border-b border-line">
        <ul role="tablist" className="flex items-center gap-6">
          {tabs.map((tab) => (
            <li key={tab.id} role="presentation">
              <button
                type="button"
                role="tab"
                id={`create-tab-${tab.id}`}
                aria-selected={mode === tab.id}
                aria-controls={`create-panel-${tab.id}`}
                onClick={() => setMode(tab.id)}
                className={`${TAB_CLASS} block ${mode === tab.id ? ACTIVE_CLASS : INACTIVE_CLASS}`}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/*
        Both panels stay mounted and only their visibility flips. Unmounting the
        hidden one would throw away work the learner cannot get back: the import
        panel holds a picked folder read into memory (the picker cannot be re-opened
        at the same path programmatically), and the generation panel holds pasted
        material. `hidden` also removes the panel from the accessibility tree, so a
        screen reader never reads the inactive tab's contents.
      */}
      <div
        role="tabpanel"
        id="create-panel-generate"
        aria-labelledby="create-tab-generate"
        hidden={mode !== "generate"}
        className="mt-8"
      >
        <StagedGenerateWizard key={initialJobId ?? "new"} initialJobId={initialJobId} />
      </div>
      <div
        role="tabpanel"
        id="create-panel-import"
        aria-labelledby="create-tab-import"
        hidden={mode !== "import"}
        className="mt-8"
      >
        <MarkdownImportForm bare />
      </div>
    </div>
  );
}
