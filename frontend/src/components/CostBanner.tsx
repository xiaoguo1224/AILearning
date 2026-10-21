"use client";

import { LocalizedText, useI18n } from "@/components/LocaleProvider";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "antd";

import { acknowledgeCostAlert, getUsage } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import type { UsageSummary } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

/**
 * Persistent, site-wide cost visibility strip. Always shows the current total
 * spend once it can reach the backend, and shows a prominent dismissible
 * banner on top of that while a cost alert is active.
 *
 * This must never break the page it's mounted on: any fetch failure (backend
 * down, network error) is swallowed and the component simply renders nothing.
 */
export function CostBanner() {
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [acking, setAcking] = useState(false);

  const refresh = useCallback(() => {
    // limit=1: this banner only needs totals and alert state, not history.
    getUsage(1)
      .then(setUsage)
      .catch(() => {
        // Fail silently - a cost widget must never block browsing the app.
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleAcknowledge() {
    setAcking(true);
    try {
      await acknowledgeCostAlert();
    } catch {
      // Ignore - the next refresh will reflect whatever the server's state is.
    } finally {
      setAcking(false);
      refresh();
    }
  }

  if (!usage) return null;

  const { alert, totals } = usage;

  return (
    <div className="flex flex-col">
      {alert.active && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-warning-border bg-warning-surface px-6 py-3 text-ui text-warning"
        >
          <p className="font-medium"><LocalizedText text={" You have spent "} />{formatUsd(alert.total_usd)}<LocalizedText text={" on API calls (estimated), past the"} />{" "}
            {formatUsd(alert.threshold_usd)}<LocalizedText text={" alert threshold. "} /></p>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/usage" className="underline underline-offset-2 hover:no-underline"><LocalizedText text={" View usage "} /></Link>
            <Button
              onClick={() => void handleAcknowledge()}
              disabled={acking}
              size="small"
            >
              {acking ? t("Acknowledging...") : t("Acknowledge")}
            </Button>
          </div>
        </div>
      )}
      <Link
        href="/usage"
        className="border-b border-line bg-surface-sunken px-6 py-1.5 text-right text-small text-ink-muted transition-colors duration-fast ease-standard hover:text-ink"
      ><LocalizedText text={" Total API spend (estimated): "} />{formatUsd(totals.estimated_cost_usd)}
      </Link>
    </div>
  );
}
