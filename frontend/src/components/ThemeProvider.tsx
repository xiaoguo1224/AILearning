"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { THEME_COOKIE, themeVariables, type Theme } from "@/lib/theme";
import { useI18n } from "./LocaleProvider";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    for (const [key, value] of Object.entries(themeVariables(next))) document.documentElement.style.setProperty(key, value);
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setTheme(next);
  }
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeSwitcher() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = t(theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  return <button type="button" onClick={toggle} aria-label={label} title={label}
    className="theme-switcher">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {theme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" />}
    </svg>
    <span>{t(theme === "dark" ? "Light theme" : "Dark theme")}</span>
  </button>;
}
