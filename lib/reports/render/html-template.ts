import type { CalloutItem, KpiTile, PeerBarPanel, RiskTableRow, TablePlan, WeeklyReportRenderModel } from "@/lib/reports/render/render-model";
import { renderColumnChartSvg, renderLineChartSvg, renderPeerPanelSvg } from "@/lib/reports/render/report-charts";
import { REPORT_FONT_FAMILY, loadReportFontFaceCss } from "@/lib/reports/render/report-font";

/**
 * Weekly report HTML/CSS template -- a pure function of a
 * WeeklyReportRenderModel (+ an already-loaded logo data URI, see
 * branding.ts). Renders ONLY what the render model already carries; adds no
 * new fact, computes no new value, calls nothing. This is the document
 * pdf-renderer.ts hands to headless Chromium for printing -- a complete,
 * self-contained HTML document, since nothing else supplies its shell.
 *
 * Layout (plain-English report pass, 2026-10-13 -- replaces the Phase 7D
 * full cover page + stacked evidence sections, which in production printed
 * one 2-bar chart and dropped 14 sections for space):
 *   Page 1  compact masthead, "The Short Version", 4 headline numbers,
 *           "What Changed This Week?" (3 cards tagged helps/hurts Range)
 *   Page 2  Gas Market -- Henry Hub trend, storage vs. 5-year average
 *   Page 3  Range and Its Peers -- quarterly FCF, valuation/FCF yield/debt
 *   Page 4  Key Risks table, what to watch, bottom line
 *   Appendix  investor questions (when any), sources & freshness, catalysts
 * Body text is 11pt with short paragraphs; charts carry direct value labels
 * instead of legends/axes wherever possible, so they read without a key.
 */

const NAVY = "#0b2947";
const ACCENT = "#0081c6";
const MUTED = "#5b7288";
const BORDER = "#d8e3ec";
const PANEL_BG = "#f3f7fb";
const TABLE_STRIPE = "#f3f7fb";
const POSITIVE = "#1f7a4d";
const POSITIVE_BG = "#e6f4ec";
const NEGATIVE = "#b42318";
const NEGATIVE_BG = "#fdecea";
const MIXED = "#9a6700";
const MIXED_BG = "#fff4d6";
// Embedded Arimo first (Arial-metric-compatible, see report-font.ts), so local and
// Vercel serverless renders lay out identically; Arial only as a fallback.
const SANS = `"${REPORT_FONT_FAMILY}", Arial, Helvetica, sans-serif`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTable(table: TablePlan, extraClass = ""): string {
  const head = table.columns.map((col) => `<th class="align-${col.align}">${escapeHtml(col.label)}</th>`).join("");
  const rows = table.rows
    .map(
      (row, index) =>
        `<tr class="${index % 2 === 1 ? "stripe" : ""}">${table.columns.map((col) => `<td class="align-${col.align}">${escapeHtml(row[col.key] ?? "--")}</td>`).join("")}</tr>`
    )
    .join("");
  const footnote = table.truncatedCount > 0 ? `<div class="small-note">+${table.truncatedCount} more not shown.</div>` : "";
  const source = table.sourceLine ? `<div class="small-note">${escapeHtml(table.sourceLine)}</div>` : "";
  return `
    <div class="table-block ${extraClass}">
      <h3>${escapeHtml(table.title)}</h3>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${footnote}
      ${source}
    </div>`;
}

function renderKpiTile(tile: KpiTile): string {
  return `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(tile.label)}</div>
      <div class="kpi-value">${escapeHtml(tile.value)}</div>
      ${tile.change ? `<div class="kpi-change">${escapeHtml(tile.change)}</div>` : ""}
    </div>`;
}

const IMPACT_LABEL = { positive: "Helps Range", negative: "Hurts Range", mixed: "Mixed for Range" } as const;

function renderChangeCard(item: CalloutItem, index: number): string {
  const badge = item.impact ? `<span class="impact impact-${item.impact}">${IMPACT_LABEL[item.impact]}</span>` : "";
  return `
    <div class="change-card ${item.impact ? `change-${item.impact}` : ""}">
      <div class="change-head"><span class="change-num">${index + 1}</span><span class="change-title">${escapeHtml(item.title)}</span>${badge}</div>
      <p>${escapeHtml(item.body)}</p>
    </div>`;
}

function renderCallout(label: string, item: CalloutItem, modifierClass: string): string {
  return `
    <div class="callout ${modifierClass}">
      <div class="callout-label">${escapeHtml(label)}</div>
      <div class="callout-title">${escapeHtml(item.title)}</div>
      <p>${escapeHtml(item.body)}</p>
    </div>`;
}

function renderPeerPanel(panel: PeerBarPanel): string {
  return `
    <div class="peer-panel">
      <div class="peer-title">${escapeHtml(panel.title)}</div>
      <div class="peer-hint">${escapeHtml(panel.hint)}</div>
      ${renderPeerPanelSvg(panel)}
    </div>`;
}

function renderRiskRow(row: RiskTableRow): string {
  const actions = [
    row.announced ? `<div class="action"><span class="action-tag action-announced">Announced</span>${escapeHtml(row.announced)}</div>` : "",
    row.possible ? `<div class="action"><span class="action-tag action-possible">Possible option</span>${escapeHtml(row.possible)}</div>` : ""
  ].join("");
  return `
      <tr>
        <td class="risk-name">${escapeHtml(row.risk)}</td>
        <td><span class="level level-${row.level.toLowerCase()}">${row.level}</span></td>
        <td>${escapeHtml(row.whyItMatters)}</td>
        <td>${actions || '<span class="muted">No announced action in this week\'s evidence.</span>'}</td>
      </tr>`;
}

export function renderReportHtml(model: WeeklyReportRenderModel, logoDataUri: string | null): string {
  const logo = logoDataUri ? `<img class="cover-logo" src="${logoDataUri}" alt="Range Resources" />` : `<div class="cover-wordmark">RANGE RESOURCES</div>`;

  const shortVersion = model.executiveAssessmentParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  const kpis = model.kpiTiles.length > 0 ? `<div class="kpi-row">${model.kpiTiles.map(renderKpiTile).join("")}</div>` : "";

  const whatChanged =
    model.whatChanged.length > 0
      ? model.whatChanged.map(renderChangeCard).join("")
      : `<p class="muted">No change since the previous report met the threshold for this section.</p>`;

  const marketCharts = model.marketCharts
    .map(
      (chart) => `
    <figure class="chart">
      <figcaption class="chart-title">${escapeHtml(chart.title)}</figcaption>
      ${renderLineChartSvg(chart)}
      <p class="chart-caption">${escapeHtml(chart.caption)}</p>
      <div class="small-note">Source: ${escapeHtml(chart.sourceLine)}</div>
    </figure>`
    )
    .join("");

  const chartGaps = model.chartGaps.length > 0 ? `<div class="gap-note"><strong>Not shown:</strong> ${model.chartGaps.map(escapeHtml).join(" ")}</div>` : "";

  const fcfChart = model.rangeFcfChart
    ? `
    <figure class="chart">
      <figcaption class="chart-title">${escapeHtml(model.rangeFcfChart.title)}</figcaption>
      ${renderColumnChartSvg(model.rangeFcfChart)}
      <p class="chart-caption">${escapeHtml(model.rangeFcfChart.caption)}</p>
      <div class="small-note">Source: ${escapeHtml(model.rangeFcfChart.sourceLine)}</div>
    </figure>`
    : "";

  const peerPanels =
    model.peerPanels.length > 0
      ? `
    <h3>How Range Compares With Peers${model.peerPanelsPeriod ? ` (${escapeHtml(model.peerPanelsPeriod)})` : ""}</h3>
    <div class="peer-grid">${model.peerPanels.map(renderPeerPanel).join("")}</div>
    <div class="small-note">EBITDAX = earnings before interest, taxes, depreciation and exploration costs, a common measure of cash earnings. Each company's free cash flow uses its own reported definition, so small differences should be read with care. Source: quarterly SEC filings, earnings materials and FactSet, as used on the dashboard.</div>`
      : "";

  const riskOpportunityRow =
    model.biggestRisk || model.biggestOpportunity
      ? `
    <div class="two-col">
      ${model.biggestRisk ? renderCallout("Biggest Risk", model.biggestRisk, "callout-risk") : "<div></div>"}
      ${model.biggestOpportunity ? renderCallout("Biggest Opportunity", model.biggestOpportunity, "callout-opportunity") : "<div></div>"}
    </div>`
      : "";

  const riskTable =
    model.riskTable.length > 0
      ? `
    <table class="risk-table">
      <thead><tr><th style="width:18%">Risk</th><th style="width:9%">Risk Level</th><th style="width:34%">Why This Matters</th><th style="width:39%">What Range Can Do</th></tr></thead>
      <tbody>${model.riskTable.map(renderRiskRow).join("")}</tbody>
    </table>
    <div class="small-note"><strong>Announced</strong> = something Range has publicly stated (guidance or news). <strong>Possible option</strong> = an idea for discussion, not a Range plan. Risk levels come from the dashboard's rules-based risk engine, not the AI.</div>`
      : `<p class="muted">The risk engine flagged no risks this week.</p>`;

  const watchItems =
    model.managementWatchItems.length > 0
      ? `
    <h3>What to Watch Next</h3>
    <ul class="watch-list">${model.managementWatchItems.map((item) => `<li><strong>${escapeHtml(item.title)}.</strong> ${escapeHtml(item.body)}</li>`).join("")}</ul>`
      : "";

  // "Investor Questions to Prepare For" (IR-report enhancement, 2026-09-08) --
  // empty most weeks by design; the whole block is omitted rather than
  // rendering an empty heading. Every responseFramework carries an explicit,
  // un-skippable label that it is IR preparation based on public
  // information, never an official Range statement.
  const investorQuestions =
    model.investorQuestions.length > 0
      ? `
    <h3>Investor Questions to Prepare For</h3>
    ${model.investorQuestions
      .map(
        (q) => `
    <div class="investor-question">
      <div class="investor-question-text">${escapeHtml(q.question)}</div>
      <div class="investor-question-line"><span class="investor-question-label">Why Now</span>${escapeHtml(q.whyNow)}</div>
      ${q.context ? `<div class="investor-question-line"><span class="investor-question-label">Context</span>${escapeHtml(q.context)}</div>` : ""}
      ${
        q.responseFramework
          ? `<div class="investor-question-framework"><span class="framework-label">Preparation Note &mdash; based on public information only, not an official Range statement</span>${escapeHtml(q.responseFramework)}</div>`
          : ""
      }
      ${q.followUpNeeded ? `<div class="investor-question-line"><span class="investor-question-label">Follow-Up for IR</span>${escapeHtml(q.followUpNeeded)}</div>` : ""}
    </div>`
      )
      .join("")}`
      : "";

  const catalystsCalendar = model.catalystsCalendarTable ? renderTable(model.catalystsCalendarTable) : "";
  const sourcesTable = renderTable(model.sourcesFreshnessTable, "sources-table");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.identity.title)}</title>
<style>
  ${loadReportFontFaceCss()}
  @page { size: Letter; margin: 0.5in 0.6in 0.6in 0.6in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${SANS}; color: ${NAVY}; font-size: 11pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  p { margin: 0 0 7px; }
  h2 { font-size: 17pt; font-weight: 800; margin: 0 0 10px; padding-bottom: 5px; border-bottom: 2.5px solid ${ACCENT}; }
  h3 { font-size: 12.5pt; font-weight: 700; margin: 16px 0 7px; }
  .muted { color: ${MUTED}; }
  .small-note { font-size: 8.5pt; color: ${MUTED}; margin-top: 4px; line-height: 1.35; }
  .page { break-before: page; }
  .risks { margin-top: 20px; }
  h2, h3 { break-after: avoid; }
  .two-col { break-inside: avoid; }

  /* Masthead (page 1) */
  .masthead { display: flex; align-items: center; gap: 18px; padding-bottom: 12px; border-bottom: 1px solid ${BORDER}; margin-bottom: 16px; }
  .cover-logo { height: 46px; width: auto; }
  .cover-wordmark { font-size: 16pt; font-weight: 800; letter-spacing: 0.02em; }
  .masthead-text { flex: 1; }
  .kicker { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: ${ACCENT}; }
  .report-title { font-size: 20pt; font-weight: 800; line-height: 1.1; margin: 2px 0 3px; }
  .report-meta { font-size: 9.5pt; color: ${MUTED}; }

  .short-version p { font-size: 11.5pt; }

  .kpi-row { display: flex; gap: 10px; margin: 14px 0 6px; }
  .kpi { flex: 1 1 0; background: ${PANEL_BG}; border-top: 3px solid ${ACCENT}; padding: 9px 10px 10px; break-inside: avoid; }
  .kpi-label { font-size: 8.5pt; font-weight: 700; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.25; min-height: 2.5em; }
  .kpi-value { font-size: 15pt; font-weight: 800; margin-top: 3px; }
  .kpi-change { font-size: 9pt; color: ${MUTED}; margin-top: 2px; line-height: 1.3; }

  .change-card { border: 1px solid ${BORDER}; border-left: 4px solid ${MUTED}; padding: 9px 12px 4px; margin-bottom: 9px; break-inside: avoid; }
  .change-positive { border-left-color: ${POSITIVE}; }
  .change-negative { border-left-color: ${NEGATIVE}; }
  .change-mixed { border-left-color: ${MIXED}; }
  .change-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .change-num { font-weight: 800; color: ${ACCENT}; }
  .change-title { font-weight: 700; font-size: 11.5pt; flex: 1; }
  .impact { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 10px; white-space: nowrap; }
  .impact-positive { color: ${POSITIVE}; background: ${POSITIVE_BG}; }
  .impact-negative { color: ${NEGATIVE}; background: ${NEGATIVE_BG}; }
  .impact-mixed { color: ${MIXED}; background: ${MIXED_BG}; }

  .chart { margin: 0 0 18px; break-inside: avoid; }
  .chart-title { font-size: 12pt; font-weight: 700; margin-bottom: 4px; }
  .chart-caption { font-size: 10.5pt; margin: 4px 0 0; }
  .gap-note { font-size: 9.5pt; color: ${MUTED}; background: ${PANEL_BG}; padding: 8px 10px; border-left: 3px solid ${BORDER}; }

  .peer-grid { display: flex; gap: 14px; }
  .peer-panel { flex: 1 1 0; break-inside: avoid; }
  .peer-title { font-size: 10.5pt; font-weight: 700; }
  .peer-hint { font-size: 8.5pt; color: ${MUTED}; margin-bottom: 4px; }

  .two-col { display: flex; gap: 12px; margin-bottom: 6px; }
  .two-col > * { flex: 1 1 0; }
  .callout { background: ${PANEL_BG}; border-left: 4px solid ${ACCENT}; padding: 9px 11px 3px; break-inside: avoid; }
  .callout-risk { border-left-color: ${NEGATIVE}; }
  .callout-opportunity { border-left-color: ${POSITIVE}; }
  .callout-label { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${MUTED}; }
  .callout-title { font-weight: 700; margin: 2px 0 4px; }
  .callout p { font-size: 10pt; }

  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  thead th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; color: ${MUTED}; border-bottom: 2px solid ${ACCENT}; padding: 5px 7px; }
  tbody td { padding: 5px 7px; border-bottom: 1px solid ${BORDER}; vertical-align: top; }
  tr { break-inside: avoid; }
  tr.stripe td { background: ${TABLE_STRIPE}; }
  .align-left { text-align: left; }
  .align-right { text-align: right; }
  .table-block { margin: 8px 0 12px; }
  .sources-table table { font-size: 8.5pt; }
  .sources-table tbody td { padding: 3px 7px; }

  .risk-table { font-size: 9.5pt; margin-top: 4px; }
  .risk-table td { padding: 6px 7px; line-height: 1.36; }
  .risk-name { font-weight: 700; }
  .level { display: inline-block; font-size: 8.5pt; font-weight: 800; padding: 2px 8px; border-radius: 10px; }
  .level-high { color: ${NEGATIVE}; background: ${NEGATIVE_BG}; }
  .level-medium { color: ${MIXED}; background: ${MIXED_BG}; }
  .level-low { color: ${ACCENT}; background: #e5f2fa; }
  .action { margin-bottom: 4px; }
  .action-tag { display: inline-block; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; padding: 1px 5px; border-radius: 3px; margin-right: 5px; }
  .action-announced { color: #fff; background: ${NAVY}; }
  .action-possible { color: ${NAVY}; border: 1px solid ${MUTED}; }

  .watch-list { margin: 0; padding-left: 18px; }
  .watch-list li { margin-bottom: 6px; }
  .bottom-line { background: ${NAVY}; color: #fff; padding: 12px 14px; font-size: 11.5pt; font-weight: 600; margin-top: 14px; break-inside: avoid; }
  .bottom-line-label { display: block; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #9fd3f0; margin-bottom: 4px; }

  .investor-question { border: 1px solid ${BORDER}; border-left: 3px solid ${ACCENT}; padding: 8px 10px; margin-top: 8px; break-inside: avoid; font-size: 10pt; }
  .investor-question-text { font-weight: 700; margin-bottom: 4px; }
  .investor-question-line { margin-top: 3px; }
  .investor-question-label { display: inline-block; font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: ${ACCENT}; margin-right: 5px; }
  .investor-question-framework { background: ${PANEL_BG}; border-left: 3px solid ${ACCENT}; padding: 5px 8px; margin-top: 5px; }
  .framework-label { display: block; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; color: ${ACCENT}; margin-bottom: 2px; }
</style>
</head>
<body>

<header class="masthead">
  <div>${logo}</div>
  <div class="masthead-text">
    <div class="kicker">Internal Weekly Briefing</div>
    <div class="report-title">${escapeHtml(model.identity.title)}</div>
    <div class="report-meta">${escapeHtml(model.identity.weekEndingLabel)} &middot; ${escapeHtml(model.identity.dataCutoffLabel)}</div>
  </div>
</header>

<section>
  <h2>The Short Version</h2>
  <div class="short-version">${shortVersion}</div>
  ${kpis}
</section>

<section>
  <h3>What Changed This Week?</h3>
  ${whatChanged}
</section>

<section class="page">
  <h2>Gas Market</h2>
  ${marketCharts}
  ${chartGaps}
</section>

<section class="page">
  <h2>Range and Its Peers</h2>
  ${fcfChart}
  ${peerPanels}
</section>

<section class="risks">
  <h2>Key Risks</h2>
  ${riskOpportunityRow}
  ${riskTable}
  ${watchItems}
  <div class="bottom-line"><span class="bottom-line-label">Bottom Line</span>${escapeHtml(model.bottomLine)}</div>
</section>

<section class="page">
  <h2>Appendix</h2>
  ${investorQuestions}
  ${sourcesTable}
  ${catalystsCalendar}
  <div class="small-note">Narrative sections are AI-written from the dashboard's verified data only; every number is taken directly from the sources above. Generated ${escapeHtml(model.generatedAtLabel)}.</div>
</section>

</body>
</html>`;
}
