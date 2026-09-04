/**
 * Phase 6E shared date-display helpers, used across the Macro tab (widget,
 * EIA Outlook, energy map, and the page-level "Last Updated" box) so every
 * module formats dates the same way instead of drifting per-file.
 *
 * Two genuinely different kinds of date, deliberately never conflated:
 * - A *data observation* (a source period like "2026-08-14" or "2026-08")
 *   is a source date, not a moment in time -- formatDataDate always parses
 *   it as UTC so it never silently shifts by a day for a viewer west of
 *   UTC, and it carries no viewer-timezone concept at all.
 * - A *refresh/generation timestamp* (an ISO instant like when a cron run
 *   or an AI summary completed) is a real moment in time -- formatRefreshTimestamp
 *   renders it in Central Time (this project's one display-timezone
 *   convention for system timestamps, matching the existing news-cron
 *   schedule documentation) rather than the viewer's local zone or UTC.
 */

/** "2026-08" -> "Aug 2026"; "2026-08-14" (or any other YYYY-MM-DD) -> "Aug 14, 2026". Never shifts by timezone -- always parsed as UTC. Returns "--" for null/unparseable input, never today's date. */
export function formatDataDate(period: string | null | undefined): string {
  if (!period) return "--";
  if (/^\d{4}-\d{2}$/.test(period)) {
    const date = new Date(`${period}-01T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return period;
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const date = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "2026-08-14" -> "Week ending Aug 14, 2026". Same UTC-anchored parsing as formatDataDate. */
export function formatWeekEnding(period: string | null | undefined): string {
  if (!period) return "--";
  const date = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  return `Week ending ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

/** A real ISO instant (e.g. a cron completion or AI generation time) -> "Aug 26, 2026 · 12:15 PM CT". Never a raw ISO string in visible UI. Returns "Not yet available" for null/unparseable input -- never falls back to the viewer's current time. */
export function formatRefreshTimestamp(iso: string | null | undefined): string {
  if (!iso) return "Not yet available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet available";
  const formatted = date.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${formatted} CT`;
}
