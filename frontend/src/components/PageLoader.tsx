"use client";

import { Spin } from "antd";

/**
 * Full-page loading indicator with a spinner.
 */
export function PageLoader({ tip = "加载中…" }: { tip?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 400,
        gap: 16,
      }}
    >
      <Spin size="large" tip={tip} />
    </div>
  );
}
