"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useI18n } from "@/components/LocaleProvider";
import styles from "./landing.module.css";

export function Landscape({ paused }: { paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const element = video.current;
    function sync() {
      if (!element) return;
      if (paused || media.matches || document.hidden) element.pause();
      else void element.play().catch(() => { /* The landscape gradient remains visible when autoplay is unavailable. */ });
    }
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { element?.pause(); media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); };
  }, [paused]);
  return <div className={styles.landscape} aria-hidden="true"><video ref={video} muted loop playsInline preload="none"
      src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260527_061033_0f369854-8849-4214-8787-9181479c8121.mp4" /></div>;
}

export function LightHero({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return <div className={styles.lightHero}>
    <Landscape paused={paused} />
    <div className={styles.lightIntro}>
      <p className={styles.lightBadge}>✳ <span>{t("Plant a question. Grow an idea.")}</span> ↗</p>
      <h1>{t("A little curiosity.")}<br />{t("A world of possibility.")}</h1>
      <p className={styles.lightDescription}>{t("A calmer place to learn deeply. Bring your questions, connect your knowledge, and let understanding grow through practice.")}</p>
      <div className={styles.lightActions}>
        <Link className={styles.primary} href="/projects">{t("Grow my knowledge")} <span aria-hidden="true">↗</span></Link>
        <a className={styles.secondary} href="#courses">{t("Explore my courses")} <span aria-hidden="true">↓</span></a>
      </div>
    </div>
    <div className={styles.lightCaption}><span>LEARN AT YOUR OWN PACE.</span><p>{t("Every question is a beginning.")}</p><div><a href="#learning">{t("Discover the approach")} ↓</a><button type="button" onClick={onToggle} aria-pressed={paused}>{t(paused ? "Resume background animation" : "Pause background animation")}</button></div></div>
  </div>;
}
