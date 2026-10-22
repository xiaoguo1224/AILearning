"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "react-vant";
import { ConfigProvider as AntConfigProvider, theme as antTheme } from "antd";
import { useTheme } from "./ThemeProvider";
import { THEMES } from "@/lib/theme";

export function VantThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const p = THEMES[theme];
  return <AntConfigProvider theme={{
    algorithm: theme === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: { colorPrimary: p.accent, colorLink: p.accent, colorBgBase: p.app, colorBgContainer: p.surface,
      colorBgElevated: p.sunken, colorText: p.ink, colorTextSecondary: p.muted,
      colorBorder: p.strong, colorBorderSecondary: p.line, borderRadius: 12, borderRadiusLG: 20,
      fontFamily: "var(--font-sans)", controlHeight: 40 },
    components: { Button: { primaryColor: p.onFill, primaryShadow: "none", borderRadius: 24 } },
  }}><ConfigProvider style={{ minHeight: "100%" }} themeVars={{
    primaryColor: "var(--sf-accent)", brandColor: "var(--sf-accent)", blue: "var(--sf-accent)",
    progressColor: "var(--sf-accent)", progressBackgroundColor: "var(--sf-line)",
    textColor: "var(--sf-ink)", textColorWeak: "var(--sf-ink-muted)",
    backgroundColor: "var(--sf-app)", backgroundColorLight: "var(--sf-surface)",
    white: "var(--sf-surface)", borderColor: "var(--sf-line)",
    buttonBorderRadius: "10px", buttonDefaultHeight: "40px", buttonSmallHeight: "34px",
    buttonPrimaryBackgroundColor: "var(--sf-accent)", buttonPrimaryBorderColor: "var(--sf-accent)",
    buttonPrimaryColor: "var(--sf-on-fill)",
    typographyLinkColor: "var(--sf-accent)", typographySecondaryColor: "var(--sf-ink-muted)",
    selectorCheckedColor: "var(--sf-surface-sunken)", selectorCheckedTextColor: "var(--sf-accent)", selectorBorderRadius: "8px",
    radioCheckedIconColor: "var(--sf-accent)", sliderActiveBackgroundColor: "var(--sf-accent)",
    cellGroupInsetPadding: "0", cellGroupInsetBorderRadius: "14px",
    cellGroupTitlePadding: "12px 0", cellGroupTitleColor: "var(--sf-ink-muted)",
    gridItemContentBackgroundColor: "transparent", cellLineHeight: "24px",
  }}>{children}</ConfigProvider></AntConfigProvider>;
}
