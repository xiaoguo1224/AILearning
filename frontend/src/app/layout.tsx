import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";

import { CostBanner } from "@/components/CostBanner";
import { AppSidebar, MobileTopBar } from "@/components/AppSidebar";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getTranslator } from "@/lib/locale-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: "StudyForge", description: t("Turn any material into a structured course with quizzes.") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslator();
  return (
    <html
      lang={t.locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansSC.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LocaleProvider locale={t.locale}>
          <CostBanner />
          <div className="flex min-h-screen items-stretch">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileTopBar />
              {children}
            </div>
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
