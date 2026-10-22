import Link from "next/link";
import styles from "./SiteBrand.module.css";

export function SiteBrand() {
  return <Link href="/" className={styles.brand} aria-label="StudyForge">
    <svg className={styles.icon} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M20 20C20 9 25 3 36 3c0 11-5 17-16 17ZM20 20c11 0 17 5 17 16-11 0-17-5-17-16ZM20 20C9 20 3 15 3 4c11 0 17 5 17 16ZM20 20C20 31 15 37 4 37c0-11 5-17 16-17Z" /></svg>
    StudyForge
  </Link>;
}
