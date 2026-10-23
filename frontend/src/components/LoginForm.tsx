"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher, useI18n } from "./LocaleProvider";
import { ThemeSwitcher, useTheme } from "./ThemeProvider";
import { SiteBrand } from "./SiteBrand";
import { Landscape } from "./landing/LightHero";
import { KnowledgeOrbit } from "./landing/KnowledgeOrbit";
import { safeReturnPath } from "@/lib/auth";
import landing from "./landing/landing.module.css";
import styles from "./LoginForm.module.css";

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const router = useRouter();
  const password = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/backend/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.current?.value ?? "" }),
      });
      if (!response.ok) {
        setError(t(response.status === 401 ? "Incorrect password. Please try again." : response.status === 429 ? "Too many attempts. Try again in a minute." : "Sign-in is temporarily unavailable. Please try again."));
        password.current?.focus();
        return;
      }
      router.replace(safeReturnPath(next));
      router.refresh();
    } catch {
      setError(t("Unable to connect. Check your connection and try again."));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <main className={`${landing.landing} ${styles.page}`} data-theme={theme} data-paused={paused}>
    <header className={landing.header}><SiteBrand /><div className={landing.headerEnd}><ThemeSwitcher /><LanguageSwitcher /></div></header>
    <div className={styles.backdrop} aria-hidden="true">
      {theme === "light" ? <Landscape paused={paused} /> : <KnowledgeOrbit />}
    </div>
    <section className={styles.content} aria-labelledby="login-title">
      <div className={styles.intro}><p className={styles.eyebrow}>✳ &nbsp; YOUR PERSONAL LEARNING SPACE</p><h1 id="login-title">{t("Welcome back.")}<br /><em>{t("Keep your curiosity growing.")}</em></h1><p>{t("Your questions, your progress, your next discovery.")}</p></div>
      <form method="post" className={styles.card} onSubmit={submit} aria-busy={busy}>
        <p className={styles.cardLabel}>{t("Enter your workspace")}</p>
        <label htmlFor="workspace-password">{t("Workspace password")}</label>
        <input ref={password} id="workspace-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "login-error login-note" : "login-note"} placeholder={t("Enter password")} />
        {error && <p id="login-error" role="alert" className={styles.error}>{error}</p>}
        <button className={styles.submit} type="submit" disabled={busy}>{t(busy ? "Signing in…" : "Enter workspace")}<span aria-hidden="true">↗</span></button>
        <p id="login-note" className={styles.note}>{t("Stay signed in for 7 days on this browser.")}</p>
        <Link className={styles.back} href="/">← {t("Back to home")}</Link>
      </form>
    </section>
    <footer className={styles.footer}><span>LEARN. BUILD. UNDERSTAND.</span><button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{t(paused ? "Resume background animation" : "Pause background animation")}</button></footer>
  </main>;
}
