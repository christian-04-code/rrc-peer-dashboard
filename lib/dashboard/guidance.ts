import guidanceData from "@/data/guidance.json";
import type { Ticker } from "./company-registry";

type GuidanceItem = { text: string; label?: string; value?: string };
type CompanyGuidance = { sections: Record<string, GuidanceItem[]>; heading?: string };
type GuidanceFile = {
  meta: { source: string; generated: string };
  companies: Record<string, CompanyGuidance>;
};

const data = guidanceData as GuidanceFile;

// Sections present across all core peers, in priority order for the compact widget.
const HIGHLIGHT_SECTIONS = ["Production", "Capital Expenditures", "Operating Costs"];
const MAX_PER_SECTION = 2;
const MAX_TOTAL = 6;

export type GuidanceHighlight = { section: string; label: string; value: string };

export function hasGuidance(ticker: Ticker): boolean {
  return Boolean(data.companies[ticker]);
}

export function getGuidanceMeta(): { source: string; generated: string } {
  return data.meta;
}

// Some companies' source bullets already come through as one label/value item
// ("Q1 2026 Actual: 2.2 Bcfe/d"); others are two consecutive plain-text lines (a header,
// then its value on the next line, e.g. "2026 Total Capital Budget" / "$556-$586MM").
// This recognizes the second pattern by shape rather than treating it as unavailable.
function looksLikeValueLine(text: string): boolean {
  const trimmed = text.trim();
  if (/^[~$(]/.test(trimmed)) return true;
  return /\d/.test(trimmed) && /(%|Bcfe|MMcf|Mcf|Mbbl|Bbl|MM\b|\$|x\b|–)/.test(trimmed);
}

function extractSectionHighlights(sectionName: string, items: GuidanceItem[]): GuidanceHighlight[] {
  const highlights: GuidanceHighlight[] = [];
  for (let index = 0; index < items.length && highlights.length < MAX_PER_SECTION; index += 1) {
    const item = items[index];
    if (item.label && item.value) {
      highlights.push({ section: sectionName, label: item.label, value: item.value });
      continue;
    }
    if (item.label || item.value || looksLikeValueLine(item.text)) continue;
    const next = items[index + 1];
    if (next && !next.label && !next.value && looksLikeValueLine(next.text)) {
      highlights.push({ section: sectionName, label: item.text, value: next.text });
      index += 1;
    }
  }
  return highlights;
}

/** Most decision-useful guidance fields for the compact right-side widget: the first label/value pairs from Production, Capital Expenditures, and Operating Costs, capped so the widget stays compact. */
export function getCompanyGuidanceHighlights(ticker: Ticker): GuidanceHighlight[] {
  const company = data.companies[ticker];
  if (!company) return [];

  const highlights: GuidanceHighlight[] = [];
  for (const sectionName of HIGHLIGHT_SECTIONS) {
    const items = company.sections[sectionName] ?? [];
    highlights.push(...extractSectionHighlights(sectionName, items));
    if (highlights.length >= MAX_TOTAL) return highlights.slice(0, MAX_TOTAL);
  }
  return highlights;
}

/** Full normalized guidance text for the detail drawer ("View full guidance"). */
export function getCompanyGuidanceFullText(ticker: Ticker): string {
  const company = data.companies[ticker];
  if (!company) return `No normalized guidance is available for ${ticker}.`;

  const lines: string[] = [];
  for (const [sectionName, items] of Object.entries(company.sections)) {
    lines.push(sectionName);
    for (const item of items) {
      lines.push(item.label && item.value ? `${item.label}: ${item.value}` : item.text);
    }
  }
  return lines.join(" · ");
}
