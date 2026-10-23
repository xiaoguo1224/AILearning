"use client";

import type { Job } from "@/lib/api";
import { formatDateTime } from "@/lib/copy";
import styles from "./JobTrace.module.css";

export function JobTrace({ job }: { job: Job }) {
  const entries = job.trace?.entries ?? [];
  return <section className={styles.trace} aria-label="AI 调用链路与执行记录">
    <header><h3>AI 调用链路与执行记录（{entries.length}）</h3><p>记录实际阶段、模型调用和返回摘要，不包含模型内部思维链。</p></header>
    <div className={`job-trace-scroll ${styles.scroll}`} tabIndex={0} role="region" aria-label="调用记录列表">
      {!entries.length && <p className={styles.empty}>此任务暂无可用调用记录；历史缺失记录无法补录。</p>}
      <ol>{entries.map((entry, index) => <li key={index} className={styles.entry}>
        <div className={styles.heading}>
          <span className={styles.badge} data-kind={entry.type}>{index + 1}. {entry.type === "thinking" ? "执行阶段" : entry.type === "tool_call" ? "调用" : "返回"}</span>
          <strong>{entry.tool}</strong>
          <time>{formatDateTime(entry.at.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(entry.at) ? entry.at : `${entry.at}Z`)}</time>
        </div>
        {entry.content && <p>{entry.content}</p>}
        {entry.call_id && <p className={styles.meta}>调用 ID：{entry.call_id.slice(0, 8)}</p>}
        {entry.input != null && <details className={styles.payload}><summary>输入摘要</summary><pre>{JSON.stringify(entry.input, null, 2)}</pre></details>}
        {entry.output != null && <details className={styles.payload}><summary>输出摘要</summary><pre>{JSON.stringify(entry.output, null, 2)}</pre></details>}
      </li>)}</ol>
    </div>
  </section>;
}
