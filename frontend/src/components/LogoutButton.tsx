"use client";

import { useState } from "react";
import { useI18n } from "./LocaleProvider";

export function LogoutButton() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/backend/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace("/login");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return <div><button type="button" disabled={busy} onClick={() => void logout()} className="rounded-control border border-line px-3 py-1.5 text-small text-ink-muted hover:text-ink">{t(busy ? "Signing out…" : "Sign out")}</button>{failed && <p role="alert" className="text-small text-danger">{t("Unable to sign out. Please try again.")}</p>}</div>;
}
