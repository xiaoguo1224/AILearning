import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { normalizeTheme, THEME_COOKIE, themeVariables } from "@/lib/theme";
import { BRAND_NAME, BRAND_TITLE } from "@/lib/brand";

import { CostBanner } from "@/components/CostBanner";
import { AppShell } from "@/components/AppShell";
import { LocaleProvider } from "@/components/LocaleProvider";
import { VantThemeProvider } from "@/components/VantThemeProvider";
import { getTranslator } from "@/lib/locale-server";
import "./globals.css";
import "katex/dist/katex.min.css";
import "react-vant/bundle/index.css";

const geistSans = localFont({
  src: "../../public/fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "../../public/fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const notoSansSC = localFont({
  src: "../../public/fonts/NotoSansSC-Variable.woff2",
  variable: "--font-noto-sans-sc",
  weight: "100 900",
  display: "swap",
  preload: false,
});


export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t.locale === "zh-CN" ? BRAND_TITLE : BRAND_NAME, applicationName: BRAND_NAME, description: t("A personal AI learning workspace") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslator();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={t.locale}
      data-theme={theme}
      style={{ ...themeVariables(theme), colorScheme: theme }}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansSC.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={t.locale}>
          <ThemeProvider initialTheme={theme}>
          <VantThemeProvider>
          <CostBanner />
          <AppShell>{children}</AppShell>
          </VantThemeProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
