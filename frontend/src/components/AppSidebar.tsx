"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageSwitcher, useI18n } from "./LocaleProvider";

/** "/" only matches itself; every other tab owns its whole subtree. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const NAV: { href: string; labelKey: string; icon: string }[] = [
  { href: "/", labelKey: "Today", icon: "M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" },
  { href: "/projects", labelKey: "Projects", icon: "M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 4.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" },
  { href: "/courses", labelKey: "Courses", icon: "M3 2.5h8.5A1.5 1.5 0 0 1 13 4v9.5a1 1 0 0 1-1.7.7L8 11l-3.3 3.2a1 1 0 0 1-1.7-.7zM3 2.5v9M6 5.5h4" },
  { href: "/usage", labelKey: "Usage", icon: "M2.5 13.5v-4M6.5 13.5v-7M10.5 13.5V4.5M14.5 13.5v-10" },
];

function NavRows({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav aria-label={t("Primary")} className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex items-center gap-2.5 rounded-control bg-surface-sunken px-2.5 py-1.5 text-small font-medium text-ink transition-colors duration-fast ease-standard"
                : "flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-small text-ink-muted transition-colors duration-fast ease-standard hover:bg-surface-sunken hover:text-ink"
            }
          >
            <Icon d={item.icon} />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

function ProjectRows() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [projects, setProjects] = useState<{ id: number; name: string }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Same-origin route (see src/app/api/sidebar-projects/route.ts): the browser
    // never talks to the backend directly, so no CORS allowlist is involved.
    fetch("/api/sidebar-projects", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        if (!cancelled) setProjects(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!projects || projects.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="px-2.5 text-micro font-medium uppercase tracking-wider text-ink-subtle">
        {t("Projects")}
      </div>
      <nav aria-label={t("Projects")} className="mt-1.5 flex flex-col gap-0.5">
        {projects.slice(0, 8).map((project) => {
          const href = `/projects/${project.id}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={project.id}
              href={href}
              aria-current={active ? "page" : undefined}
              title={project.name}
              className={
                active
                  ? "flex items-center gap-2.5 rounded-control bg-surface-sunken px-2.5 py-1.5 text-small font-medium text-ink transition-colors duration-fast ease-standard"
                  : "flex items-center gap-2.5 rounded-control px-2.5 py-1.5 text-small text-ink-muted transition-colors duration-fast ease-standard hover:bg-surface-sunken hover:text-ink"
              }
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-line-strong text-[10px] font-semibold text-ink-subtle"
              >
                {project.name.trim().charAt(0).toUpperCase() || "·"}
              </span>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/70 px-3 py-4 backdrop-blur-xl lg:flex">
      <Link href="/" className="px-2.5 text-subtitle font-semibold tracking-tight text-ink">
        StudyForge
      </Link>
      <div className="mt-5">
        <NavRows />
      </div>
      <ProjectRows />
      <div className="mt-auto pt-4">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-surface/70 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <Link href="/" className="text-subtitle font-semibold tracking-tight text-ink">
          StudyForge
        </Link>
        <LanguageSwitcher />
      </div>
      <nav aria-label={t("Primary")} className="flex gap-1 overflow-x-auto px-4 pb-2.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex shrink-0 items-center gap-1.5 rounded-control bg-surface-sunken px-2.5 py-1.5 text-small font-medium text-ink"
                  : "flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 text-small text-ink-muted hover:bg-surface-sunken hover:text-ink"
              }
            >
              <Icon d={item.icon} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
