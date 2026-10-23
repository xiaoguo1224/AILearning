"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LanguageSwitcher, useI18n } from "@/components/LocaleProvider";
import { SiteBrand } from "@/components/SiteBrand";
import { ThemeSwitcher, useTheme } from "@/components/ThemeProvider";
import type { CourseSummary } from "@/lib/types";
import styles from "./landing.module.css";
import { KnowledgeOrbit } from "./KnowledgeOrbit";
import { LightHero } from "./LightHero";

function Arrow({ down = false }: { down?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={down ? { transform: "rotate(90deg)" } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}

export function LandingPage({ courses, unavailable }: { courses: CourseSummary[]; unavailable: boolean }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const journey = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const courseScene = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const root = journey.current;
    if (!root) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function update() {
      frame = 0;
      if (!root) return;
      const bounds = root.getBoundingClientRect();
      const progress = media.matches ? 0 : Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height - window.innerHeight)));
      root.style.setProperty("--progress", String(progress));
      root.dataset.scene = progress > 0.28 ? "courses" : "hero";
      if (hero.current) hero.current.inert = !media.matches && progress > 0.28;
      if (courseScene.current) courseScene.current.inert = !media.matches && progress < 0.28;
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
    };
  }, [theme]);

  const nav = <>
    <a href="#learning" onClick={() => setMenuOpen(false)}>{t("The approach")}</a>
    <a href="#courses" onClick={() => setMenuOpen(false)}>{t("My courses")}</a>
    <Link href="/projects">{t("My workspace")} <span aria-hidden="true">↗</span></Link>
  </>;

  return (
    <main className={styles.landing} data-paused={paused} data-theme={theme}>
      <a className={styles.skip} href="#learning">{t("Skip introduction")}</a>
      <header className={styles.header}>
        <SiteBrand />
        <nav className={styles.desktopNav} aria-label={t("Primary")}>{nav}</nav>
        <div className={styles.headerEnd}>
          <ThemeSwitcher />
          <LanguageSwitcher />
          <button className={styles.menuButton} aria-label={t("Toggle navigation")} aria-expanded={menuOpen} aria-controls="landing-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "×" : "☰"}</button>
        </div>
        {menuOpen && <nav id="landing-menu" className={styles.mobileNav} aria-label={t("Mobile navigation")}>{nav}</nav>}
      </header>

      <section className={styles.journey} ref={journey} aria-label={t("A journey from curiosity to understanding")}>
        <div className={styles.stage}>
          {theme === "light" ? <LightHero paused={paused} onToggle={() => setPaused(!paused)} /> : <>
          <KnowledgeOrbit />
          <div className={styles.stageGrid} aria-hidden="true" />
          <div className={styles.hero} ref={hero}>
            <div className={styles.eyebrow}><span />{t("A personal space for a curious mind")}</div>
            <div className={styles.heroHeading}>
              <h1>{t("Follow your curiosity.")}<br />{t("Build real understanding.")}</h1>
              <p className={styles.serif}>Make it <em>click.</em></p>
            </div>
            <div className={styles.heroBottom}>
              <p>{t("Connect what you learn, what you build, and what you understand. Your AI learning workspace, shaped around your questions.")}</p>
              <Link className={styles.primary} href="/projects">{t("Enter my workspace")}<Arrow /></Link>
            </div>
            <div className={styles.heroFoot}><a href="#courses">{t("Scroll to explore")}<Arrow down /></a><span>LEARN. BUILD. UNDERSTAND.</span><span>01 — 03</span></div>
          </div>
          <div className={styles.courseScene} ref={courseScene} inert>
            <p className={styles.eyebrow}>{t("Your next idea starts here")}</p>
            <h2>{t("A world of knowledge.")}<br /><em className={styles.serif}>{t("Your own path.")}</em></h2>
            <p>{t("From the first tensor to the next paper. Pick up where curiosity takes you.")}</p>
            <a href="#courses" className={styles.textLink}>{t("Explore my courses")} <Arrow down /></a>
            <div className={styles.scrollNames} aria-hidden="true" data-paused={paused}>
              <div className={styles.scrollNamesTrack}>
                {[0, 1].map((copy) => <div className={styles.scrollNamesGroup} key={copy}>
                  {(courses.length ? courses : [{ id: 0, title: t("Your learning starts here"), description: "" }]).map((course) => <span key={course.id}>{course.title}<i>✳</i></span>)}
                </div>)}
              </div>
            </div>
            <button className={styles.scenePause} onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? t("Resume course animation") : t("Pause course animation")}</button>
          </div>
          <div className={styles.progress} aria-hidden="true"><span /></div>
          </>}
        </div>
      </section>

      <section id="learning" className={styles.learning} aria-labelledby="learning-title">
        <div className={styles.sectionLabel}><span>01 / THE APPROACH</span><span>{t("Built around understanding")}</span></div>
        <div className={styles.glass}>
          <div className={styles.glassIntro}><p className={styles.eyebrow}>{t("Less collecting. More connecting.")}</p><h2 id="learning-title">{t("Let knowledge")}<br /><em>{t("become your own.")}</em></h2><p>{t("Bring your courses, papers, code, and questions together. Learn the idea, try it locally, and use the evidence to find your next step.")}</p></div>
          <div className={styles.steps}>
            {[
              ["01", "Learn with context", "Start with a course or a question. Connect concepts to your project and source materials."],
              ["02", "Build, then reflect", "Run your code locally. Upload code and logs for AI static review, evidence, and progressive hints."],
              ["03", "Make understanding last", "Turn mistakes into targeted practice and sourced knowledge drafts. Review core content before confirming it."],
            ].map(([number, title, description]) => <article key={number}><span>{number} /</span><h3>{t(title)}</h3><p>{t(description)}</p></article>)}
          </div>
          <div className={styles.glassFoot}><span>{t("Your project. Your questions. Your pace.")}</span><Link href="/projects">{t("Find my next step")}<Arrow /></Link></div>
        </div>
      </section>

      <section id="courses" className={styles.courses} aria-labelledby="courses-title">
        <div className={styles.sectionLabel}><span>02 / YOUR LEARNING</span><span>{t("Keep the curiosity moving")}</span></div>
        <div className={styles.coursesHeading}><h2 id="courses-title">{t("Small questions.")}<br /><em>{t("New possibilities.")}</em></h2><Link className={styles.textLink} href="/courses">{t("All courses")}<Arrow /></Link></div>
        {unavailable ? <div className={styles.empty} role="status"><p>{t("Courses are temporarily unavailable. Your learning history is unchanged.")}</p><Link className={styles.textLink} href="/">{t("Try again")}<Arrow /></Link></div> : courses.length === 0 ? <div className={styles.empty}><p>{t("A blank page is a good place to begin. Turn your first resource into a course.")}</p><Link className={styles.primary} href="/courses/new">{t("Create my first course")}<Arrow /></Link></div> : <>
          <div className={styles.marquee} data-paused={paused}>
            <div className={styles.marqueeTrack}>
              {[0, 1].map((copy) => <div className={styles.marqueeGroup} key={copy} aria-hidden={copy === 1 ? true : undefined} inert={copy === 1 ? true : undefined}>{courses.map((course) => <Link href={`/courses/${course.id}`} key={course.id} title={course.title}>{course.title}<span aria-hidden="true">✳</span></Link>)}</div>)}
            </div>
          </div>
          <div className={styles.marqueeControls}><span>{t("Real courses. Your growing knowledge.")}</span><button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? t("Resume course animation") : t("Pause course animation")}<span aria-hidden="true">{paused ? " ▷" : " Ⅱ"}</span></button></div>
          <div className={styles.courseList}>{courses.map((course, index) => <Link key={course.id} href={`/courses/${course.id}`} className={styles.courseRow}><span className={styles.courseNumber}>{String(index + 1).padStart(2, "0")}</span><h3>{course.title}</h3><Arrow /></Link>)}</div>
        </>}
      </section>

      <footer className={styles.footer}><div><p>THE NEXT CHAPTER IS YOURS.</p><h2>{t("Stay curious.")}</h2><Link className={styles.primary} href="/projects">{t("Start exploring")}<Arrow /></Link></div><div className={styles.footerBottom}><SiteBrand /><span>{t("A personal AI learning workspace")}</span><Link href="/courses">{t("All courses")} ↗</Link><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>{t("Back to top")} ↑</a></div></footer>
    </main>
  );
}
