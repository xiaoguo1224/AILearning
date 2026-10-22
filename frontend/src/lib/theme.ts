export type Theme = "dark" | "light";
export const THEME_COOKIE = "studyforge_theme";
export const normalizeTheme = (value?: string): Theme => value === "dark" ? "dark" : "light";

export const THEMES = {
  dark: {
    app: "#080c0b", surface: "#111a15", sunken: "#17231b", line: "#2b3b2e", strong: "#455747", hover: "#7f9b7b",
    ink: "#f4f4ed", muted: "#b4c1ae", subtle: "#9aaa94", accent: "#ccffb9", fillHover: "#e5ffdb", onFill: "#10190d",
    success: "#8ce0ba", successSurface: "#122e24", successBorder: "#285c46",
    warning: "#f6d482", warningSurface: "#302719", warningBorder: "#665035",
    danger: "#ffadb0", dangerSurface: "#351d22", dangerBorder: "#753b46",
    mastered: "#50b485", solid: "#a6e2b4", shaky: "#e5b55b", untouched: "#243329",
  },
  light: {
    app: "#f7f7f7", surface: "#ffffff", sunken: "#eef2eb", line: "#dce4d8", strong: "#a7b4a2", hover: "#6a8163",
    ink: "#263c2e", muted: "#52694f", subtle: "#64775f", accent: "#3c684d", fillHover: "#30563e", onFill: "#ffffff",
    success: "#28724e", successSurface: "#e8f4ec", successBorder: "#a9d5b5",
    warning: "#805615", warningSurface: "#fff6df", warningBorder: "#e6ce96",
    danger: "#a63247", dangerSurface: "#fff0f2", dangerBorder: "#e6a6b1",
    mastered: "#28724e", solid: "#a9d5b5", shaky: "#e5b55b", untouched: "#edf1ea",
  },
} as const;

export function masteryColors(theme: Theme) {
  const p = THEMES[theme];
  return { mastered: p.mastered, solid: p.solid, shaky: p.shaky, not_started: p.untouched };
}

export function themeVariables(theme: Theme): Record<string, string> {
  const p = THEMES[theme];
  return {
    "--sf-app": p.app, "--sf-surface": p.surface, "--sf-surface-sunken": p.sunken,
    "--sf-line": p.line, "--sf-line-strong": p.strong, "--sf-line-hover": p.hover,
    "--sf-ink": p.ink, "--sf-ink-muted": p.muted, "--sf-ink-subtle": p.subtle,
    "--sf-accent": p.accent, "--sf-fill": p.accent, "--sf-fill-hover": p.fillHover, "--sf-on-fill": p.onFill,
    "--sf-success": p.success, "--sf-success-surface": p.successSurface, "--sf-success-border": p.successBorder,
    "--sf-success-surface-hover": p.sunken, "--sf-success-fill": "#337f5b", "--sf-success-on-fill": "#ffffff",
    "--sf-warning": p.warning, "--sf-warning-surface": p.warningSurface, "--sf-warning-border": p.warningBorder,
    "--sf-warning-fill": "#e5b55b", "--sf-warning-on-fill": "#21190c",
    "--sf-danger": p.danger, "--sf-danger-surface": p.dangerSurface, "--sf-danger-border": p.dangerBorder,
    "--sf-danger-fill": "#b83e53", "--sf-danger-fill-hover": "#ce4b61", "--sf-danger-on-fill": "#ffffff",
    "--sf-shadow-raise": theme === "light" ? "0 5px 22px #263c2e08" : "none",
    "--sf-shadow-overlay": theme === "light" ? "0 16px 50px #263c2e20" : "0 16px 50px #00000055",
    "--concept-mastered": p.mastered, "--concept-solid": p.solid, "--concept-shaky": p.shaky,
    "--concept-not-started": p.untouched, "--concept-not-started-border": p.strong, "--concept-rule": p.line,
    "--concept-label-text": p.ink, "--concept-muted-text": p.muted, "--concept-column-label": p.muted,
    "--concept-column-sublabel": p.subtle, "--concept-surface": p.surface,
    "--concept-scroll-edge": theme === "light" ? "#263c2e20" : "#c9e7bf29",
  };
}
