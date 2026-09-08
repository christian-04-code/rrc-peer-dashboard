import type { CalloutItem, EvidenceSection, TablePlan, WeeklyReportRenderModel } from "@/lib/reports/render/render-model";
import { renderBarChartSvg } from "@/lib/reports/render/svg-charts";

/**
 * Phase 7D HTML/CSS report template -- a pure function of a
 * WeeklyReportRenderModel (+ an already-loaded logo data URI, see
 * branding.ts). Renders ONLY what the render model already carries; adds no
 * new fact, computes no new value, calls nothing. This is the document
 * pdf-renderer.ts hands to headless Chromium for printing -- a complete,
 * self-contained HTML document (not an embeddable fragment), since nothing
 * else supplies its <html>/<head>/<body> shell.
 *
 * Design direction (Section 5 of the brief, exercised with the design
 * latitude the brief's follow-up clarification granted -- this is an
 * intentional information-architecture decision, not a mechanical section-
 * by-section transcription of the brief's own page-1/page-2-4/closing
 * outline): a serif display face (Georgia -- a universally available web-
 * safe serif, no external font fetch) for the title and section headings
 * paired with a plain sans body/table face, the same contrast an equity-
 * research masthead uses to read as "prepared document" rather than "web
 * page." At-a-glance renders as a compact stat-tile strip (not a plain
 * list) so the week's headline numbers land as fast, scannable facts.
 * Biggest Risk / Biggest Opportunity sit side by side at equal visual
 * weight, since neither is definitionally more important than the other.
 * An evidence section with a chart but no table runs chart-left/commentary-
 * right (a real research note rarely gives a small bar chart a full text
 * column of its own); a section carrying a table runs full width, since a
 * multi-column table needs the room a half-width column would cramp.
 *
 * Cover page (page 1 only): its layout is controlled by page 1 of
 * Range_Natural_Gas_Macro_Outlook_July_2026.docx, used strictly as a VISUAL
 * template (never read as a factual/data source -- every string the cover
 * prints below still comes only from WeeklyReportRenderModel). That
 * reference page is a single vertical stack -- large logo, generous white
 * space, a small bold uppercase kicker, a large navy title, a smaller slate
 * subtitle, a thin divider, then label/value rows for date and controlling
 * sources -- which is why the cover markup below is its own vertical block
 * distinct from every other page's two-column/table layout. This only
 * governs the cover; every other page keeps its prior serif/sans design
 * unchanged.
 */

const NAVY = "#0b2947";
const ACCENT = "#0081c6";
const MUTED = "#5b7288";
const BORDER = "#d8e3ec";
const CALLOUT_BG = "#eef3fa";
const TABLE_STRIPE = "#eaf2f9";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Arial, Helvetica, sans-serif";

/** Cover-page-only tokens, matching the two distinct grays the reference page uses (a slate for the subtitle, a lighter label gray for the date/sources captions) -- not used anywhere outside .cover-*. */
const COVER_SLATE = "#3e4c59";
const COVER_LABEL = "#7b8794";
const COVER_DIVIDER = "#cbd2d9";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderStatTiles(table: TablePlan): string {
  const tiles = table.rows
    .map((row) => `<div class="stat-tile"><div class="stat-label">${escapeHtml(row.metric ?? "")}</div><div class="stat-value">${escapeHtml(row.value ?? "--")}</div></div>`)
    .join("");
  return `
    <div class="stat-strip-block">
      <div class="block-title">At a Glance</div>
      <div class="stat-strip">${tiles}</div>
    </div>`;
}

function renderTable(table: TablePlan): string {
  const head = table.columns.map((col) => `<th class="align-${col.align}">${escapeHtml(col.label)}</th>`).join("");
  const rows = table.rows
    .map(
      (row, index) =>
        `<tr class="${index % 2 === 1 ? "stripe" : ""}">${table.columns.map((col) => `<td class="align-${col.align}">${escapeHtml(row[col.key] ?? "--")}</td>`).join("")}</tr>`
    )
    .join("");
  const footnote = table.truncatedCount > 0 ? `<div class="table-footnote">+${table.truncatedCount} more not shown this week (content budget).</div>` : "";
  const source = table.sourceLine ? `<div class="table-source">${escapeHtml(table.sourceLine)}</div>` : "";
  return `
    <div class="table-block">
      <div class="block-title">${escapeHtml(table.title)}</div>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${footnote}
      ${source}
    </div>`;
}

function renderCallout(label: string, item: CalloutItem, modifierClass = ""): string {
  return `
    <div class="callout ${modifierClass}">
      <div class="callout-label">${escapeHtml(label)}</div>
      <div class="callout-title">${escapeHtml(item.title)}</div>
      <div class="callout-body">${escapeHtml(item.body)}</div>
    </div>`;
}

function renderCommentaryAndImplication(section: EvidenceSection): string {
  const commentary = section.commentary.map((sentence) => `<p class="commentary">${escapeHtml(sentence)}</p>`).join("");
  const implication = section.rangeImplication
    ? `<div class="range-implication"><span class="range-implication-label">Range Implication</span>${escapeHtml(section.rangeImplication)}</div>`
    : "";
  return `${commentary}${implication}`;
}

/** Chart-only sections run as a compact two-column layout; a section carrying a table runs full width (a multi-column table needs the room). */
function renderEvidenceSection(section: EvidenceSection): string {
  const heading = `<h3>${escapeHtml(section.heading)}</h3>`;

  if (section.table) {
    const chart = section.chart ? `<div class="chart-block">${renderBarChartSvg(section.chart)}<div class="chart-caption">${escapeHtml(section.chart.caption)}</div></div>` : "";
    return `
    <section class="evidence-section evidence-section-wide">
      ${heading}
      ${chart}
      ${renderTable(section.table)}
      ${renderCommentaryAndImplication(section)}
    </section>`;
  }

  if (section.chart) {
    return `
    <section class="evidence-section evidence-section-split">
      ${heading}
      <div class="evidence-grid">
        <div class="evidence-chart-col">
          ${renderBarChartSvg(section.chart)}
          <div class="chart-caption">${escapeHtml(section.chart.caption)}</div>
        </div>
        <div class="evidence-text-col">
          ${renderCommentaryAndImplication(section)}
        </div>
      </div>
    </section>`;
  }

  return `
    <section class="evidence-section evidence-section-wide">
      ${heading}
      ${renderCommentaryAndImplication(section)}
    </section>`;
}

export function renderReportHtml(model: WeeklyReportRenderModel, logoDataUri: string | null): string {
  const logo = logoDataUri ? `<img class="cover-logo" src="${logoDataUri}" alt="Range Resources" />` : `<div class="cover-wordmark">RANGE RESOURCES</div>`;

  // Pure function of already-typed render-model data (this file's own header rule) --
  // no new fact, just naming the source categories already listed in the sources table.
  const controllingSources =
    model.sourcesFreshnessTable.rows.map((row) => row.source).filter(Boolean).join(" · ") || "See Sources & Data Freshness below";

  const executiveParagraphs = model.executiveAssessmentParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  const riskOpportunityRow = `
    <div class="risk-opportunity-row">
      ${model.biggestRisk ? renderCallout("Biggest Risk", model.biggestRisk, "callout-risk") : "<div></div>"}
      ${model.biggestOpportunity ? renderCallout("Biggest Opportunity", model.biggestOpportunity, "callout-opportunity") : "<div></div>"}
    </div>`;

  const whatChanged =
    model.whatChanged.length > 0
      ? `
    <div class="what-changed">
      <div class="block-title">What Changed</div>
      <ul>${model.whatChanged.map((item) => `<li><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.body)}</li>`).join("")}</ul>
    </div>`
      : "";

  const evidenceSections = model.evidenceSections.map(renderEvidenceSection).join("");

  const risksOpportunitiesTable = model.keyRisksAndOpportunitiesTable ? renderTable(model.keyRisksAndOpportunitiesTable) : "";

  const watchItems =
    model.managementWatchItems.length > 0
      ? `
    <div class="closing-block">
      <h3>What Management Should Watch</h3>
      <ul>${model.managementWatchItems.map((item) => `<li><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.body)}</li>`).join("")}</ul>
    </div>`
      : "";

  const sourcesTable = renderTable(model.sourcesFreshnessTable);

  const omittedNote =
    model.omittedContentLabels.length > 0
      ? `<div class="footnote">Additional lower-materiality subjects not shown this week due to the report's content budget: ${escapeHtml(model.omittedContentLabels.join(", "))}.</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.identity.title)}</title>
<style>
  @page { size: Letter; margin: 0.5in 0.6in 0.6in 0.6in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${SANS};
    color: ${NAVY};
    font-size: 10pt;
    line-height: 1.38;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3 { color: ${NAVY}; margin: 0 0 5px; font-family: ${SERIF}; }
  .thin-divider { border: none; border-top: 1px solid ${BORDER}; margin: 12px 0; }

  /* Cover page only -- vertical stack per page 1 of the reference DOCX (see this file's header comment). */
  .cover-logo-block { margin-bottom: 34px; }
  .cover-logo { height: 100px; width: auto; }
  .cover-wordmark { font-family: ${SANS}; font-size: 20pt; font-weight: 800; letter-spacing: 0.02em; color: ${NAVY}; }
  .cover-kicker { font-family: ${SANS}; font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: ${ACCENT}; margin-bottom: 14px; }
  .cover-title { font-family: ${SANS}; font-size: 28pt; font-weight: 800; line-height: 1.08; color: ${NAVY}; margin-bottom: 6px; }
  .cover-subtitle { font-family: ${SANS}; font-size: 13pt; font-weight: 400; color: ${COVER_SLATE}; margin-bottom: 26px; }
  .cover-divider { border: none; border-top: 1px solid ${COVER_DIVIDER}; margin: 0 0 18px; }
  .cover-meta-row { margin-bottom: 14px; }
  .cover-meta-row.cover-meta-row-last { margin-bottom: 0; }
  .cover-meta-label { font-family: ${SANS}; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${COVER_LABEL}; margin-bottom: 3px; }
  .cover-meta-value { font-family: ${SANS}; font-size: 11pt; color: ${NAVY}; }

  .assessment-heading { font-family: ${SERIF}; font-size: 12pt; font-weight: 700; letter-spacing: 0.01em; margin: 10px 0 5px; }
  .assessment p { margin: 0 0 6px; }

  .block-title { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${ACCENT}; margin-bottom: 5px; }

  .stat-strip-block { margin: 12px 0 10px; }
  /* flex-wrap (not a 3-column grid) so a non-multiple-of-3 item count -- the
     common case, since At a Glance picks one representative per backdrop
     category and a quiet week rarely has exactly 3/6/9 -- never leaves a
     dangling empty, background-colored trailing cell (a real Preview PDF
     showed exactly this: 5 items in a 6-cell grid). */
  .stat-strip { display: flex; flex-wrap: wrap; gap: 1px; background: ${BORDER}; border: 1px solid ${BORDER}; }
  .stat-tile { background: #fff; padding: 7px 9px 7px 8px; border-left: 2px solid ${ACCENT}; flex: 1 1 32%; min-width: 32%; }
  .stat-label { font-size: 7.5pt; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 2px; }
  .stat-value { font-size: 10.5pt; font-weight: 700; color: ${NAVY}; }

  .risk-opportunity-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }

  .table-block { margin: 8px 0 12px; break-inside: avoid; }
  .table-block .block-title { font-size: 9.5pt; font-weight: 800; color: ${NAVY}; text-transform: none; letter-spacing: normal; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.03em; color: ${MUTED}; border-bottom: 1.5px solid ${ACCENT}; padding: 3px 6px; }
  tbody td { padding: 3.5px 6px; border-bottom: 1px solid ${BORDER}; }
  tr.stripe td { background: ${TABLE_STRIPE}; }
  .align-left { text-align: left; }
  .align-right { text-align: right; }
  .table-footnote, .table-source, .footnote { font-size: 7.5pt; color: ${MUTED}; margin-top: 3px; }

  .callout { background: ${CALLOUT_BG}; border-left: 3px solid ${ACCENT}; padding: 7px 9px; break-inside: avoid; }
  .callout-label { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${ACCENT}; margin-bottom: 3px; }
  .callout-title { font-size: 9.5pt; font-weight: 700; margin-bottom: 2px; font-family: ${SERIF}; }
  .callout-body { font-size: 9pt; }
  .what-changed { border: 1px solid ${BORDER}; border-radius: 2px; padding: 7px 9px; margin-top: 10px; break-inside: avoid; }
  .what-changed ul, .closing-block ul { margin: 3px 0 0; padding-left: 15px; }
  .what-changed li, .closing-block li { margin-bottom: 3px; font-size: 9pt; }

  .page-break { break-after: page; }
  .evidence-section { break-inside: avoid; margin-bottom: 13px; }
  .evidence-section h3 { font-size: 11pt; border-bottom: 2px solid ${ACCENT}; padding-bottom: 3px; margin-bottom: 5px; }
  .evidence-grid { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 14px; align-items: start; }
  .chart-caption { font-size: 8.5pt; color: ${MUTED}; margin-top: 2px; }
  .commentary { font-size: 9pt; margin: 3px 0; }
  .range-implication { background: ${CALLOUT_BG}; border-left: 3px solid ${ACCENT}; padding: 5px 8px; font-size: 9pt; margin-top: 5px; }
  .range-implication-label { display: block; font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${ACCENT}; margin-bottom: 2px; }

  .evidence-heading-rule { font-size: 8pt; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.08em; margin: 2px 0 8px; }

  .closing-block { margin-bottom: 12px; break-inside: avoid; }
  .closing-block h3 { font-size: 11pt; border-bottom: 2px solid ${ACCENT}; padding-bottom: 3px; }
  .bottom-line { background: ${NAVY}; color: #fff; padding: 9px 11px; font-size: 10pt; font-weight: 600; font-family: ${SERIF}; }
</style>
</head>
<body>

<div class="page-one">
  <div class="cover-logo-block">${logo}</div>
  <div class="cover-kicker">Investor Relations Briefing | Internal</div>
  <div class="cover-title">${escapeHtml(model.identity.title)}</div>
  <div class="cover-subtitle">${escapeHtml(model.identity.subtitle)}</div>
  <hr class="cover-divider" />
  <div class="cover-meta-row">
    <div class="cover-meta-label">Week Ending</div>
    <div class="cover-meta-value">${escapeHtml(model.identity.weekEndingLabel)}</div>
  </div>
  <div class="cover-meta-row">
    <div class="cover-meta-label">Data As Of</div>
    <div class="cover-meta-value">${escapeHtml(model.identity.dataCutoffLabel)}</div>
  </div>
  <div class="cover-meta-row cover-meta-row-last">
    <div class="cover-meta-label">Controlling Sources</div>
    <div class="cover-meta-value">${escapeHtml(controllingSources)}</div>
  </div>
</div>

<div class="page-break"></div>

<div class="assessment-block">
  <div class="assessment-heading">Executive Assessment</div>
  <div class="assessment">${executiveParagraphs}</div>

  ${renderStatTiles(model.atAGlanceTable)}
  ${riskOpportunityRow}
  ${whatChanged}
</div>

${evidenceSections}

<hr class="thin-divider" />

${risksOpportunitiesTable}
${watchItems}

<div class="closing-block">
  <h3>Bottom Line</h3>
  <div class="bottom-line">${escapeHtml(model.bottomLine)}</div>
</div>

${sourcesTable}
${omittedNote}
<div class="footnote">Generated ${escapeHtml(model.generatedAtLabel)}.</div>

</body>
</html>`;
}
