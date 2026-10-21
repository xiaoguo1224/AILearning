"use client";

import { Table } from "antd";

import { LocalizedText } from "@/components/LocaleProvider";
import type { PerCourseUsage, UsageCall } from "@/lib/types";

interface UsageTablesProps {
  perCourse: PerCourseUsage[];
  recentCalls: UsageCall[];
  locale: string;
  formatCount: (n: number | null | undefined) => string;
  formatUsd: (n: number | null | undefined) => string;
  formatTimestamp: (s: string, locale: string) => string;
  rowKey: (row: PerCourseUsage) => string;
  AttributedTo: (props: { row: PerCourseUsage }) => React.ReactNode;
}

export function UsageTables({
  perCourse,
  recentCalls,
  locale,
  formatCount,
  formatUsd,
  formatTimestamp,
  rowKey,
  AttributedTo,
}: UsageTablesProps) {
  return (
    <>
      <Table
        dataSource={perCourse}
        rowKey={rowKey}
        pagination={false}
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
      <Table
        dataSource={recentCalls}
        rowKey="id"
        pagination={false}
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
    </>
  );
}
