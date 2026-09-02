"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/dashboard/InfoTip";
import type { WeeklyReportLatestStatus } from "@/app/api/reports/latest/route";

/**
 * Phase 7E's Overview-page control. Checks `/api/reports/latest` on mount
 * (cheap JSON metadata, never the PDF itself -- see that route's own
 * header) to decide its own render state; the actual download is a plain
 * `<a href="/api/reports/latest/download" download>` link, so the browser
 * handles the file save natively using the server's own
 * `Content-Disposition` filename -- no client-side fetch/blob/regeneration
 * logic, no loading spinner while "generating," because nothing is ever
 * generated here. Same useState/useEffect/AbortController idiom
 * `lib/market/use-macro-risk.ts` already established for this codebase.
 */

const TOOLTIP_COPY =
  "Generated automatically each week after the latest EIA natural gas storage data is validated. The report combines Range company data, natural gas market fundamentals, peer trends, forecasts and material news into a frozen weekly snapshot. Deterministic analytics identify the key changes, risks and opportunities, then AI synthesizes the validated evidence into a concise Range-focused management briefing.";

type State = { status: "loading" } | { status: "available"; storageWeekEnding: string } | { status: "unavailable" };

function formatWeekEndingLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function WeeklyReportDownloadButton() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reports/latest", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return (await response.json()) as WeeklyReportLatestStatus;
      })
      .then((data) => {
        if (data.available) setState({ status: "available", storageWeekEnding: data.storageWeekEnding });
        else setState({ status: "unavailable" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "unavailable" });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="weekly-report-control" aria-label="Weekly AI Report">
      {state.status === "available" ? (
        <a className="weekly-report-download-button" href="/api/reports/latest/download" download>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1.5" />
          </svg>
          Download Weekly AI Report
          <span className="weekly-report-download-meta">Week Ending {formatWeekEndingLabel(state.storageWeekEnding)}</span>
        </a>
      ) : (
        <button type="button" className="weekly-report-download-button weekly-report-download-button--disabled" disabled aria-disabled="true">
          {state.status === "loading" ? "Checking Weekly AI Report…" : "Weekly AI Report — Not Available Yet"}
        </button>
      )}
      <InfoTip text={TOOLTIP_COPY} placement="bottom" align="left" wide />
    </section>
  );
}
