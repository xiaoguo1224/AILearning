"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "react-vant";

export function VantThemeProvider({ children }: { children: ReactNode }) {
  return <ConfigProvider style={{ minHeight: "100%" }} themeVars={{
    primaryColor: "var(--sf-accent)", brandColor: "var(--sf-accent)", blue: "var(--sf-accent)",
    textColor: "var(--sf-ink)", textColorWeak: "var(--sf-ink-muted)",
    backgroundColor: "var(--sf-app)", backgroundColorLight: "var(--sf-surface)",
    white: "var(--sf-surface)", borderColor: "var(--sf-line)",
    buttonBorderRadius: "10px", buttonDefaultHeight: "40px", buttonSmallHeight: "34px",
    buttonPrimaryBackgroundColor: "var(--sf-accent)", buttonPrimaryBorderColor: "var(--sf-accent)",
    typographyLinkColor: "var(--sf-accent)", typographySecondaryColor: "var(--sf-ink-muted)",
    selectorCheckedColor: "#eaf7ee", selectorCheckedTextColor: "var(--sf-accent)", selectorBorderRadius: "8px",
    radioCheckedIconColor: "var(--sf-accent)", sliderActiveBackgroundColor: "var(--sf-accent)",
    cellGroupInsetPadding: "0", cellGroupInsetBorderRadius: "14px",
    cellGroupTitlePadding: "12px 0", cellGroupTitleColor: "var(--sf-ink-muted)",
    gridItemContentBackgroundColor: "transparent", cellLineHeight: "24px",
  }}>{children}</ConfigProvider>;
}
