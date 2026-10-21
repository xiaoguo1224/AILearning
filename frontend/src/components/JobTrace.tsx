"use client";

import { Cell, Empty, List, NoticeBar, Space, Tag, Typography } from "react-vant";
import type { Job } from "@/lib/api";

export function JobTrace({ job }: { job: Job }) {
  const entries = job.trace?.entries ?? [];
  return <Cell.Group title={`AI 调用链路与执行记录（${entries.length}）`} card>
    <NoticeBar text="记录实际阶段、模型调用和返回摘要，不包含模型内部思维链。" scrollable={false} wrapable />
    <List className="job-trace-scroll" finished finishedText="" onLoad={async () => {}}
      style={{ height: 360, overflowY: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
      {!entries.length && <Empty description="此任务暂无可用调用记录；历史缺失记录无法补录。" />}
      {entries.map((entry, index) => <Cell key={index} title={
        <Space><Tag type={entry.type === "tool_call" ? "primary" : entry.type === "tool_result" ? "success" : "default"}>
          {index + 1}. {entry.type === "thinking" ? "执行阶段" : entry.type === "tool_call" ? "调用" : "返回"}
        </Tag><Typography.Text>{entry.tool}</Typography.Text></Space>
      } label={<Space direction="vertical" block>
        <Typography.Text type="secondary">{new Date(entry.at.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(entry.at) ? entry.at : `${entry.at}Z`).toLocaleString()}</Typography.Text>
        {entry.content && <Typography.Text>{entry.content}</Typography.Text>}
        {entry.call_id && <Typography.Text type="secondary">调用 ID：{entry.call_id.slice(0, 8)}</Typography.Text>}
        {entry.input != null && <Typography.Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>输入摘要：{JSON.stringify(entry.input, null, 2)}</Typography.Text>}
        {entry.output != null && <Typography.Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>输出摘要：{JSON.stringify(entry.output, null, 2)}</Typography.Text>}
      </Space>} />)}
    </List>
  </Cell.Group>;
}
