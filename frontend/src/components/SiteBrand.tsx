import Link from "next/link";
import styles from "./SiteBrand.module.css";
import { BRAND_NAME, BRAND_TITLE } from "@/lib/brand";

export function SiteBrand() {
  return <Link href="/" className={styles.brand} aria-label={BRAND_TITLE}>
    <svg className={styles.icon} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M5 11c7-1 13 1 19 6 6-5 12-7 19-6v23c-7-1-13 1-19 6-6-5-12-7-19-6V11Z" fill="currentColor" opacity=".12" />
      <path d="M5 11c7-1 13 1 19 6v23c-6-5-12-7-19-6V11Zm19 29c6-5 12-7 19-6V15" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M13 28c6-8 12 6 17-5 2-4 1-8 6-12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="39" cy="7" r="3.5" fill="currentColor" />
    </svg>
    {BRAND_NAME}
  </Link>;
}
