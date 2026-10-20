"use client";

import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createTranslator, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const locale = useContext(LocaleContext);
  return useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
}

export function LocalizedText({ text }: { text: string }) {
  const { t } = useI18n();
  return t(text);
}

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex shrink-0 items-center gap-2 text-small text-ink-muted">
      <span className="sr-only">{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value === "en" ? "en" : "zh-CN";
          document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
          startTransition(() => router.refresh());
        }}
        className="rounded-control border border-line bg-surface px-2 py-1 text-ink disabled:opacity-60"
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
