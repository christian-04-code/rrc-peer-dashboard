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
    <section className="weekly-report-control" aria-label="Weekly Range Resources AI Intelligence Report">
      {state.status === "available" ? (
        <a className="weekly-report-download-button" href="/api/reports/latest/download" download>
          Download Weekly Intelligence Report
          <span className="weekly-report-download-meta">Week Ending {formatWeekEndingLabel(state.storageWeekEnding)}</span>
        </a>
      ) : (
        <span className="weekly-report-download-button weekly-report-download-button--disabled" aria-disabled="true">
          {state.status === "loading" ? "Checking Weekly Intelligence Report…" : "Weekly Intelligence Report not yet available"}
        </span>
      )}
      <InfoTip text={TOOLTIP_COPY} placement="bottom" align="left" wide />
    </section>
  );
}
