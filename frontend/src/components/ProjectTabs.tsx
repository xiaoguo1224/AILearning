"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./LocaleProvider";

const TABS: { suffix: string; labelKey: string }[] = [
  { suffix: "", labelKey: "Overview" },
  { suffix: "/learn", labelKey: "Learn" },
  { suffix: "/explore", labelKey: "Explore" },
  { suffix: "/submissions", labelKey: "Submissions" },
  { suffix: "/knowledge", labelKey: "Knowledge" },
  { suffix: "/review-tasks", labelKey: "Review tasks" },
  { suffix: "/suggestions", labelKey: "Suggestions" },
];

/** Workspace tab bar rendered under the project header by the project layout. */
export function ProjectTabs({ projectId }: { projectId: number }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav aria-label={t("Project sections")} className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active =
          tab.suffix === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.suffix || "/"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "shrink-0 border-b-2 border-accent px-3 pb-2.5 pt-1 text-small font-medium text-ink"
                : "shrink-0 border-b-2 border-transparent px-3 pb-2.5 pt-1 text-small text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
            }
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
