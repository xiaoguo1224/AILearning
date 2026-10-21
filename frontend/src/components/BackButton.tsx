"use client";

import Link from "next/link";

interface BackButtonProps {
  href: string;
  children: React.ReactNode;
}

/**
 * A consistent, elegant back navigation button used across the app.
 */
export function BackButton({ href, children }: BackButtonProps) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--ink-muted)",
        textDecoration: "none",
        padding: "6px 12px 6px 8px",
        borderRadius: 8,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--ink)";
        e.currentTarget.style.background = "var(--surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--ink-muted)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
      {children}
    </Link>
  );
}
