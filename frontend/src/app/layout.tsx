import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { CostBanner } from "@/components/CostBanner";
import { SiteHeader } from "@/components/SiteHeader";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: "StudyForge", description: t("Turn any material into a structured course with quizzes.") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslator();
  return (
    <html
      lang={t.locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={t.locale}>
          <CostBanner />
          <SiteHeader />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
