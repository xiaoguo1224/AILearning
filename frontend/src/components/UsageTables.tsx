"use client";

import { Table } from "antd";
import Link from "next/link";

import { LocalizedText } from "@/components/LocaleProvider";
import { formatDateTime } from "@/lib/copy";
import { formatCount, formatUsd } from "@/lib/format";
import type { PerCourseUsage, UsageCall } from "@/lib/types";

function formatTimestamp(iso: string, locale: string): string {
  return formatDateTime(iso, locale === "en" ? "en" : "zh-CN");
}

function AttributedTo({ row }: { row: PerCourseUsage }) {
  if (row.group !== "course") {
    return (
      <Link
        href={`#note-${row.group}`}
        className="text-ink-muted underline decoration-dotted underline-offset-2"
      >
        {row.label}
      </Link>
    );
  }
  if (row.title === null || row.course_id === null) {
    return (
      <span className="text-ink-muted">
        {row.label} <span className="text-small"><LocalizedText text={"(deleted)"} /></span>
      </span>
    );
  }
  return (
    <Link href={`/courses/${row.course_id}`} className="hover:underline">
      {row.label}
    </Link>
  );
}

function rowKey(row: PerCourseUsage): string {
  return `${row.group}:${row.course_id ?? ""}:${row.title === null ? "gone" : "live"}:${row.label}`;
}

interface UsageTablesProps {
  perCourse: PerCourseUsage[];
  recentCalls: UsageCall[];
  locale: string;
}

export function UsageTables({ perCourse, recentCalls, locale }: UsageTablesProps) {
  return (
    <>
      {perCourse.length === 0 ? (
        <p className="mt-3 rounded-surface border border-dashed border-line-strong px-4 py-6 text-center text-small text-ink-muted">
          <LocalizedText text={" No LLM spend recorded yet. "} />
        </p>
      ) : (
        <Table
          dataSource={perCourse}
          rowKey={rowKey}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          columns={[
            {
              title: <LocalizedText text={" Attributed to "} />,
              key: "attributed",
              render: (_, row) => <AttributedTo row={row} />,
            },
            {
              title: <LocalizedText text={" Calls "} />,
              key: "calls",
              render: (_, row) => formatCount(row.calls),
            },
            {
              title: <LocalizedText text={" Input tokens "} />,
              key: "input_tokens",
              render: (_, row) => formatCount(row.input_tokens),
            },
            {
              title: <LocalizedText text={" Output tokens "} />,
              key: "output_tokens",
              render: (_, row) => formatCount(row.output_tokens),
            },
            {
              title: <LocalizedText text={" Est. cost "} />,
              key: "estimated_cost_usd",
              render: (_, row) => formatUsd(row.estimated_cost_usd),
            },
          ]}
        />
      )}
      {perCourse
        .filter((row) => row.note !== null)
        .map((row) => (
          <p key={row.group} id={`note-${row.group}`} className="mt-2 text-small text-ink-subtle">
            {row.note}
          </p>
        ))}
      {recentCalls.length === 0 ? (
        <p className="mt-3 rounded-surface border border-dashed border-line-strong px-4 py-6 text-center text-small text-ink-muted">
          <LocalizedText text={" No LLM calls recorded yet. "} />
        </p>
      ) : (
        <Table
          dataSource={recentCalls}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          style={{ marginTop: 24 }}
          columns={[
            {
              title: <LocalizedText text={" Time "} />,
              key: "created_at",
              render: (_, call) => formatTimestamp(call.created_at, locale),
            },
            { title: <LocalizedText text={" Provider "} />, dataIndex: "provider", key: "provider" },
            { title: <LocalizedText text={" Model "} />, dataIndex: "model", key: "model" },
            { title: <LocalizedText text={" Stage "} />, dataIndex: "stage", key: "stage" },
            {
              title: <LocalizedText text={" In / out tokens "} />,
              key: "tokens",
              render: (_, call) => `${formatCount(call.input_tokens)} / ${formatCount(call.output_tokens)}`,
            },
            {
              title: <LocalizedText text={" Est. cost "} />,
              key: "cost",
              render: (_, call) => (
                <>
                  {formatUsd(call.estimated_cost_usd)}
                  {call.approximate && (
                    <span style={{ marginLeft: 4 }}><LocalizedText text={"(approx.)"} /></span>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
