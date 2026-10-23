"use client";

import { Table, Tag } from "antd";
import Link from "next/link";

import type { SubmissionSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/copy";

interface SubmissionsTableProps {
  items: SubmissionSummary[];
  projectId: number;
}

/**
 * Paginated table of code submissions.
 */
export function SubmissionsTable({ items, projectId }: SubmissionsTableProps) {
  const columns = [
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 80,
      render: (v: number) => <Tag>v{v}</Tag>,
    },
    {
      title: "备注",
      dataIndex: "user_note",
      key: "user_note",
      ellipsis: true,
      render: (note: string | null) => note || <span style={{ color: "#999" }}>无备注</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => (
        <Tag color={status === "reviewed" ? "green" : "default"}>
          {status === "reviewed" ? "已评审" : "已提交"}
        </Tag>
      ),
    },
    {
      title: "评审结果",
      key: "review",
      ellipsis: true,
      render: (_: unknown, item: SubmissionSummary) =>
        item.latest_review ? (
          <span style={{ fontSize: 13, color: "#666" }}>
            {item.latest_review.finding_count} 个发现 · {item.latest_review.summary}
          </span>
        ) : (
          <span style={{ color: "#999" }}>—</span>
        ),
    },
    {
      title: "提交时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (ts: string) => (
        <span style={{ fontSize: 12, color: "#666" }}>
          {formatDateTime(ts, "zh-CN")}
        </span>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 100,
      render: (_: unknown, item: SubmissionSummary) => (
        <Link
          href={
            item.quiz_item_id && item.quiz_course_id
              ? `/courses/${item.quiz_course_id}/quiz/${item.quiz_item_id}`
              : `/projects/${projectId}/submissions/${item.id}`
          }
          style={{ color: "#1fae54" }}
        >
          打开
        </Link>
      ),
    },
  ];

  return (
    <Table
      dataSource={items}
      columns={columns}
      rowKey="id"
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
    />
  );
}
