
import { UsageTables } from "@/components/UsageTables";
import { LocalizedText } from "@/components/LocaleProvider";
import { getLocale, getTranslator } from "@/lib/locale-server";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError, getUsage } from "@/lib/api";
import { formatCount, formatUsd } from "@/lib/format";
import type { PerCourseUsage, UsageSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale);
}

/**
 * Three cases, not two. `course_id` survives deletion (the backend needs it to keep a
 * dead course's spend in its own bucket) and SQLite reissues it, so linking on the id
 * sent the learner to whichever live course had since inherited that rowid, under the
 * dead course's name. `title` is null once the course is gone, and is the signal.
 * A deleted row must also not fall through to the note link below: there is no
 * `#note-course` anchor for it to land on.
 */
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

/**
 * `course_id` alone collides once an id is reissued, which React reports as two children
 * with key `course:1`. The backend buckets on the deletion stamp as well, so the key has
 * to carry that dimension; the payload exposes it as the pairing of `title` (liveness)
 * and `label` (the stamped historical name). Residual collision, stated rather than
 * denied: TWO deleted courses that held the same id, one titled "" and one titled
 * exactly "Course #<that id>". An empty stamp is falsy, so it falls through the label
 * precedence to the same "Course #N" the other one is named. Nothing simpler collides.
 */
function rowKey(row: PerCourseUsage): string {
  return `${row.group}:${row.course_id ?? ""}:${row.title === null ? "gone" : "live"}:${row.label}`;
}

export default async function UsagePage() {
  const t = await getTranslator();
  let usage: UsageSummary | null = null;
  let loadError: string | null = null;
  try {
    usage = await getUsage(50, await getLocale());
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : t("Could not reach the server. Is the backend running?");
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href="/courses"
        className="text-small text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
      ><LocalizedText text={" ← All courses "} /></Link>
      <PageHeader
        className="mt-4"
        title={t("API cost usage")}
        description={t("Estimated LLM spend on this server, across course generation and re-teaching alike. Figures on this page are ESTIMATES derived from token counts and provider pricing tables, not billed amounts.")}
      />

      {loadError && <ErrorState className="mt-8" title="" message={loadError} />}

      {usage && (
        <>
          <section aria-labelledby="totals-heading" className="mt-8">
            <h2 id="totals-heading" className="text-subtitle"><LocalizedText text={" Totals "} /></h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card padding={4}>
                <dt className="text-small text-ink-subtle"><LocalizedText text={"LLM calls"} /></dt>
                <dd className="mt-1 text-title tabular-nums">{formatCount(usage.totals.calls)}</dd>
              </Card>
              <Card padding={4}>
                <dt className="text-small text-ink-subtle"><LocalizedText text={"Input tokens"} /></dt>
                <dd className="mt-1 text-title tabular-nums">
                  {formatCount(usage.totals.input_tokens)}
                </dd>
              </Card>
              <Card padding={4}>
                <dt className="text-small text-ink-subtle"><LocalizedText text={"Output tokens"} /></dt>
                <dd className="mt-1 text-title tabular-nums">
                  {formatCount(usage.totals.output_tokens)}
                </dd>
              </Card>
              <Card padding={4}>
                <dt className="text-small text-ink-subtle"><LocalizedText text={"Estimated cost (USD)"} /></dt>
                <dd className="mt-1 text-title tabular-nums">
                  {formatUsd(usage.totals.estimated_cost_usd)}
                </dd>
              </Card>
            </dl>
            {usage.totals.approximate_note && (
              <p className="mt-2 text-small text-ink-subtle">{usage.totals.approximate_note}</p>
            )}
          </section>

          <section
            aria-labelledby="alert-heading"
            className="mt-6 rounded-surface border border-line p-4 text-ui"
          >
            <h2 id="alert-heading" className="sr-only"><LocalizedText text={" Alert and spend limit configuration "} /></h2>
            <p><LocalizedText text={" Recurring spend alert threshold:"} />{" "}
              <span className="font-medium tabular-nums">{formatUsd(usage.alert.threshold_usd)}</span>
              {usage.alert.active && (
                <Badge tone="warning" className="ml-2"><LocalizedText text={" Active "} /></Badge>
              )}
            </p>
            {usage.limit.configured ? (
              <>
                <p className="mt-1"><LocalizedText text={" Hard spend cap:"} />{" "}
                  <span className="font-medium tabular-nums">
                    {formatUsd(usage.limit.limit_usd)}
                  </span>
                  <Badge tone={usage.limit.reached ? "danger" : "success"} className="ml-2">
                    {usage.limit.reached ? "Reached" : "Not reached"}
                  </Badge>
                </p>
                {usage.limit.reached && (
                  <p className="mt-1 text-ink-muted"><LocalizedText text={"Further paid generations are blocked."} /></p>
                )}
              </>
            ) : (
              <p className="mt-1 text-ink-muted"><LocalizedText text={" No hard spend cap is configured, generations are never blocked on cost. "} /></p>
            )}
          </section>

                    <UsageTables
            perCourse={usage.per_course}
            recentCalls={usage.recent_calls}
            locale={t.locale}
          />
        </>
      )}
    </main>
  );
}
