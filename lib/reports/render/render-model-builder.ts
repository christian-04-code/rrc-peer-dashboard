import type { WeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import type { WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { budgetForTier } from "@/lib/reports/render/content-budget";
import type { RenderBudgetTier, WeeklyReportRenderModel } from "@/lib/reports/render/render-model";
import { buildAtAGlanceTable, buildRisksOpportunitiesTable, buildSourcesFreshnessTable } from "@/lib/reports/render/table-builder";
import { buildEvidenceSections } from "@/lib/reports/render/evidence-sections";

/**
 * Phase 7D -- the ONE place a WeeklyReportRenderModel is constructed, from
 * exactly the two frozen/persisted inputs Section 15/16 of the brief
 * specifies: an already-frozen WeeklyReportPayload (a "ready" or
 * "published" snapshot's own payload -- see report-repo.ts) and the
 * already-validated, already-persisted WeeklyAnalystAssessment for that
 * same snapshot (see analysis-repo.ts). No DB call, no live fetch, no AI
 * call happens here or anywhere downstream of it (html-template.ts,
 * pdf-renderer.ts) -- pure, deterministic, and reproducible: the same two
 * inputs always produce the same render model, byte for byte.
 */

const REPORT_TITLE = "WEEKLY RANGE RESOURCES AI INTELLIGENCE REPORT";
const REPORT_SUBTITLE = "Market, Company & Peer Intelligence";

function formatDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatTimestampLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date);
  return `${day}, ${time} UTC`;
}

/**
 * Splits the AI's executiveAssessment into paragraphs on a blank line
 * (the Phase 7C.1 system prompt explicitly instructs this separator).
 * Falls back to grouping sentences into ~3-sentence paragraphs if the
 * model's response didn't include a blank-line separator, so rendering
 * never depends on the AI having followed that instruction exactly --
 * only ai-contract.ts's actual validation rules are ever enforced as hard
 * requirements.
 */
function splitIntoParagraphs(text: string): string[] {
  const blankLineParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (blankLineParagraphs.length > 1) return blankLineParagraphs;

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [text];
  const paragraphs: string[] = [];
  const sentencesPerParagraph = 3;
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join(" ").trim());
  }
  return paragraphs.length > 0 ? paragraphs : [text.trim()];
}

export function buildWeeklyReportRenderModel(payload: WeeklyReportPayload, assessment: WeeklyAnalystAssessment, tier: RenderBudgetTier = "standard"): WeeklyReportRenderModel {
  const budget = budgetForTier(tier);

  const { sections: evidenceSections, omittedLabels } = buildEvidenceSections(payload, budget);

  return {
    identity: {
      title: REPORT_TITLE,
      subtitle: REPORT_SUBTITLE,
      weekEndingLabel: `Week Ending ${formatDateLabel(payload.storageWeekEnding)}`,
      dataCutoffLabel: `Data Cutoff: ${formatTimestampLabel(payload.dataCutoffAt)}`
    },
    executiveAssessmentParagraphs: splitIntoParagraphs(assessment.executiveAssessment),
    atAGlanceTable: buildAtAGlanceTable(payload, budget),
    biggestRisk: { title: assessment.biggestRisk.title, body: assessment.biggestRisk.assessment },
    biggestOpportunity: { title: assessment.biggestOpportunity.title, body: assessment.biggestOpportunity.assessment },
    whatChanged: assessment.whatChanged.slice(0, budget.maxWhatChangedItems).map((item) => ({ title: item.title, body: item.assessment })),
    evidenceSections,
    keyRisksAndOpportunitiesTable: buildRisksOpportunitiesTable(payload, budget),
    managementWatchItems: assessment.managementWatchItems.slice(0, budget.maxWatchItems).map((item) => ({ title: item.item, body: item.reason })),
    bottomLine: assessment.bottomLine,
    sourcesFreshnessTable: buildSourcesFreshnessTable(payload, budget),
    generatedAtLabel: formatTimestampLabel(assessment.generatedAt),
    budgetTier: tier,
    omittedContentLabels: [...new Set(omittedLabels)]
  };
}
