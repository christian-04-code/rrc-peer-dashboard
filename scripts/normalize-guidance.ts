/**
 * One-off normalization pass over data/guidance.json's free-text bullets into
 * data/guidance_normalized.json for the 7 core peers.
 *
 * data/guidance.json has no reliable machine-readable schema (confirmed by audit:
 * label/value pairing covers well under half of bullets, even within one company,
 * and section names vary per peer). A generic regex parser over that shape would
 * silently misattribute values. Instead, each field below is a hand-verified
 * reading of the actual source bullets, and this script's job is the mechanical
 * part: (1) self-check that every cited bullet actually exists verbatim in
 * guidance.json — catches transcription mistakes — (2) apply unit conversions
 * and component sums live (never pre-computed by hand), (3) assemble the schema,
 * (4) report confidence levels and flag every "low" extraction for review.
 *
 * Every value carries a `classification`: "company_guidance" (direct quote) or
 * "model_calculation" (summed by this script from multiple disclosed components).
 * The two are never mixed without that label.
 *
 * Do not guess/interpolate: a field is left null rather than summing components
 * the company never itself totaled AND that this script also can't defensibly
 * sum (e.g. mismatched units, or a component missing entirely).
 */

import fs from "node:fs";
import path from "node:path";

const GUIDANCE_PATH = path.join(process.cwd(), "data", "guidance.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "guidance_normalized.json");

type Confidence = "high" | "medium" | "low";
type Classification = "company_guidance" | "model_calculation";

interface RangeValue {
  low: number;
  high: number;
  unit?: string;
  period: string;
  source_text: string;
  confidence: Confidence;
  classification: Classification;
  partial?: boolean;
  note?: string;
}

interface PointValue {
  value: number;
  unit?: string;
  period: string;
  source_text: string;
  confidence: Confidence;
  classification: Classification;
  note?: string;
  direction?: string;
}

interface DirectFieldSpec {
  kind: "direct";
  section: string;
  /** Bullet text(s) that must exist verbatim in guidance.json for this peer/section — self-check guard. */
  verbatimBullets: string[];
  compute: () => Omit<RangeValue, "classification">;
}

interface SumComponent {
  section: string;
  verbatimBullets: string[];
  low: number;
  high: number;
  label: string;
}

interface SumFieldSpec {
  kind: "sum";
  components: SumComponent[];
  unit?: string;
  period: string;
  confidence: Confidence;
  partial?: boolean;
  note?: string;
}

type RangeFieldSpec = DirectFieldSpec | SumFieldSpec;

interface PointFieldSpec {
  section: string;
  verbatimBullets: string[];
  compute: () => Omit<PointValue, "classification">;
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

const YEAR_2026_DAYS = daysInYear(2026); // 365 — 2026 is not a leap year

interface PeerSpec {
  production: RangeFieldSpec | null;
  /** Peer-specific, non-comparable point figure (e.g. RRC's year-end exit-rate target).
   *  Must never be read as equivalent to another peer's `production` (full-year average). */
  productionYearEndTarget?: PointFieldSpec;
  capex: RangeFieldSpec | null;
  cashUnitCost: RangeFieldSpec | null;
  fcf: RangeFieldSpec | null;
  ebitdax: RangeFieldSpec | null;
  /** One-off, non-comparable extra fields — never folded into the main fields above. */
  marketingIncrementalFcfTargetMm?: PointFieldSpec;
  fcfGrowthRatePct?: PointFieldSpec;
}

const PEER_SPECS: Record<string, PeerSpec> = {
  RRC: {
    // Genuine gap, not a "low confidence" substitution: RRC discloses Q1/Q2 rates and a
    // year-end exit-rate target, never a full-year average the way other peers do. Do not
    // paper over that with a proxy number — see productionYearEndTarget below instead, which
    // is a distinct, clearly-labeled field that must never be compared to other peers'
    // production_total_bcfe_per_day (full-year average vs. single exit-rate point).
    production: null,
    productionYearEndTarget: {
      section: "Production",
      verbatimBullets: ["Year-End 2026 Target: ~2.5 Bcfe/d"],
      compute: () => ({
        value: 2.5,
        unit: "Bcfe/d",
        period: "2026 YE (exit rate, not a full-year average)",
        source_text: "Year-End 2026 Target: ~2.5 Bcfe/d",
        confidence: "high",
      }),
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total Capital Budget", "$650–$700MM"],
      compute: () => ({
        low: 650,
        high: 700,
        period: "2026",
        source_text: "2026 Total Capital Budget | $650–$700MM",
        confidence: "high",
      }),
    },
    // Partial model calculation: LOE + Cash G&A only. GP&T excluded — RRC discloses only price
    // sensitivities for GP&T, no absolute $/Mcfe figure, so it cannot be included in a sum.
    cashUnitCost: {
      kind: "sum",
      components: [
        {
          section: "Operating Costs",
          verbatimBullets: ["Lease Operating Expense (LOE)", "$0.14–$0.16/Mcfe"],
          low: 0.14,
          high: 0.16,
          label: "Lease Operating Expense (LOE): $0.14–$0.16/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["Cash G&A / G&A", "~$0.23/Mcfe"],
          low: 0.23,
          high: 0.23,
          label: "Cash G&A / G&A: ~$0.23/Mcfe",
        },
      ],
      unit: "$/Mcfe",
      period: "2026",
      confidence: "medium",
      partial: true,
      note: "Excludes GP&T — RRC discloses only price sensitivities, no absolute GP&T figure, so it cannot be included in a sum.",
    },
    fcf: {
      kind: "direct",
      section: "Financial Targets",
      verbatimBullets: ["2026–2027 Cumulative Free Cash Flow", "$1.7B"],
      compute: () => ({
        low: 1700,
        high: 1700,
        period: "2026-2027 cumulative (not a single-year figure)",
        source_text: "2026–2027 Cumulative Free Cash Flow | $1.7B",
        confidence: "medium",
      }),
    },
    ebitdax: null, // no EBITDAX guidance disclosed in this section
  },

  AR: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Production", "~4.1 Bcfe/d"],
      compute: () => ({
        low: 4.1,
        high: 4.1,
        period: "2026",
        source_text: "2026 Total Production | ~4.1 Bcfe/d",
        confidence: "high",
      }),
    },
    // Model calculation: Base D&C + Land + Discretionary Growth. Maintenance D&C (~$900MM) and
    // Incremental Development D&C (~$100MM) are explicitly EXCLUDED — they sum to ~$1.0B, i.e.
    // they are subsets already contained within Base D&C Capital, not additional spend. Including
    // them alongside Base D&C would double-count.
    capex: {
      kind: "sum",
      components: [
        {
          section: "Capital Expenditures",
          verbatimBullets: ["2026 Base D&C Capital", "~$1.0B"],
          low: 1000,
          high: 1000,
          label: "2026 Base D&C Capital: ~$1.0B",
        },
        {
          section: "Capital Expenditures",
          verbatimBullets: ["2026 Land Capital", "~$100MM"],
          low: 100,
          high: 100,
          label: "2026 Land Capital: ~$100MM",
        },
        {
          section: "Capital Expenditures",
          verbatimBullets: ["Discretionary Growth Capital", "Up to ~$200MM additional"],
          low: 0,
          high: 200,
          label: "Discretionary Growth Capital: up to ~$200MM additional",
        },
      ],
      period: "2026",
      confidence: "medium",
      note: "$1,300MM (top of range) includes discretionary growth capital, which AR describes as conditional/optional. Excludes Maintenance D&C (~$900MM) and Incremental Development D&C (~$100MM) — these are subsets already contained within Base D&C Capital, not additional spend.",
    },
    // Model calculation: full sum, no missing components (Cash Production Expense + Cash G&A +
    // Net Marketing Expense — these three are the complete cost stack AR discloses).
    cashUnitCost: {
      kind: "sum",
      components: [
        {
          section: "Operating Costs",
          verbatimBullets: ["2026 Cash Production Expense", "$2.25–$2.35/Mcfe"],
          low: 2.25,
          high: 2.35,
          label: "2026 Cash Production Expense: $2.25–$2.35/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["Cash G&A", "$0.11–$0.13/Mcfe"],
          low: 0.11,
          high: 0.13,
          label: "Cash G&A: $0.11–$0.13/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["Net Marketing Expense", "$0.02–$0.04/Mcfe"],
          low: 0.02,
          high: 0.04,
          label: "Net Marketing Expense: $0.02–$0.04/Mcfe",
        },
      ],
      unit: "$/Mcfe",
      period: "2026",
      confidence: "high",
    },
    fcf: null, // only leverage target/timing disclosed, no FCF dollar guidance anywhere
    ebitdax: null, // EBITDAX only appears as the denominator in a leverage ratio target, never as a dollar figure
  },

  CNX: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Production", "605–620 Bcfe"],
      compute: () => {
        const low = 605 / YEAR_2026_DAYS;
        const high = 620 / YEAR_2026_DAYS;
        return {
          low,
          high,
          period: "2026 (converted from annual total)",
          source_text: `2026 Total Production | 605–620 Bcfe annual (÷ ${YEAR_2026_DAYS} days = ${low.toFixed(6)}–${high.toFixed(6)} Bcfe/d)`,
          confidence: "high",
        };
      },
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total Capital Budget", "$556–$586MM"],
      compute: () => ({
        low: 556,
        high: 586,
        period: "2026",
        source_text: "2026 Total Capital Budget | $556–$586MM",
        confidence: "high",
      }),
    },
    cashUnitCost: {
      kind: "direct",
      section: "Operating Costs",
      verbatimBullets: ["Fully Burdened Cash Cost", "~$1.15/Mcfe", "Represents total cash costs before DD&A"],
      compute: () => ({
        low: 1.15,
        high: 1.15,
        unit: "$/Mcfe",
        period: "2026",
        source_text: "Fully Burdened Cash Cost | ~$1.15/Mcfe | Represents total cash costs before DD&A",
        confidence: "high",
      }),
    },
    fcf: {
      kind: "direct",
      section: "Financial Guidance",
      verbatimBullets: ["2026 Free Cash Flow", "Updated: ~$525MM", "Prior: ~$550MM"],
      compute: () => ({
        low: 525,
        high: 525,
        period: "2026",
        source_text: "2026 Free Cash Flow | Updated: ~$525MM (Prior: ~$550MM, Status: Lowered)",
        confidence: "medium",
      }),
    },
    ebitdax: {
      kind: "direct",
      section: "Financial Guidance",
      verbatimBullets: ["2026 Adjusted EBITDAX", "Updated: $1.265–$1.315B", "Prior: $1.310–$1.360B"],
      compute: () => ({
        low: 1265,
        high: 1315,
        period: "2026",
        source_text: "2026 Adjusted EBITDAX | Updated: $1.265–$1.315B (Prior: $1.310–$1.360B, Status: Lowered)",
        confidence: "medium",
      }),
    },
  },

  CRK: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Production", "1,250–1,400 MMcfe/d"],
      compute: () => ({
        low: 1250 / 1000,
        high: 1400 / 1000,
        period: "2026",
        source_text: "2026 Total Production | 1,250–1,400 MMcfe/d (÷ 1000 = 1.25–1.4 Bcfe/d)",
        confidence: "high",
      }),
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total CapEx", "$1.4–$1.5B"],
      compute: () => ({
        low: 1400,
        high: 1500,
        period: "2026",
        source_text: "2026 Total CapEx | $1.4–$1.5B",
        confidence: "high",
      }),
    },
    // Partial model calculation: LOE + Gathering & Transportation only.
    cashUnitCost: {
      kind: "sum",
      components: [
        {
          section: "Operating Costs",
          verbatimBullets: ["Lease Operating Expense (LOE)", "$0.25–$0.29/Mcfe"],
          low: 0.25,
          high: 0.29,
          label: "Lease Operating Expense (LOE): $0.25–$0.29/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["Gathering & Transportation", "$0.34–$0.40/Mcfe"],
          low: 0.34,
          high: 0.4,
          label: "Gathering & Transportation: $0.34–$0.40/Mcfe",
        },
      ],
      unit: "$/Mcfe",
      period: "2026",
      confidence: "medium",
      partial: true,
      note: "Excludes Cash G&A ($32–34MM, disclosed in absolute dollars not $/Mcfe — converting would require a production volume estimate, out of scope here) and excludes DD&A (non-cash).",
    },
    fcf: null, // only leverage covenant / liquidity / funding-strategy disclosed
    ebitdax: null,
  },

  EQT: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Sales Volume", "2,275–2,375 Bcfe"],
      compute: () => {
        const low = 2275 / YEAR_2026_DAYS;
        const high = 2375 / YEAR_2026_DAYS;
        return {
          low,
          high,
          period: "2026 (converted from annual total)",
          source_text: `2026 Total Sales Volume | 2,275–2,375 Bcfe annual (÷ ${YEAR_2026_DAYS} days = ${low.toFixed(6)}–${high.toFixed(6)} Bcfe/d). Note: EQT's disclosed metric is "Sales Volume," not literally "Production."`,
          confidence: "medium",
        };
      },
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total Maintenance + Growth Capital", "~$2.65–$2.85B"],
      compute: () => ({
        low: 2650,
        high: 2850,
        period: "2026",
        source_text: "2026 Total Maintenance + Growth Capital | ~$2.65–$2.85B",
        confidence: "high",
      }),
    },
    cashUnitCost: {
      kind: "direct",
      section: "Operating Costs",
      verbatimBullets: ["2026 Total Unit Costs", "$1.07–$1.21/Mcfe"],
      compute: () => ({
        low: 1.07,
        high: 1.21,
        unit: "$/Mcfe",
        period: "2026",
        source_text: "2026 Total Unit Costs | $1.07–$1.21/Mcfe (includes full-year impact of Equitrans and Olympus)",
        confidence: "high",
      }),
    },
    fcf: {
      kind: "direct",
      section: "Financial Guidance",
      verbatimBullets: ["2026 Free Cash Flow", "~$3.5B"],
      compute: () => ({
        low: 3500,
        high: 3500,
        period: "2026",
        source_text: "2026 Free Cash Flow | ~$3.5B (based on recent strip pricing)",
        confidence: "high",
      }),
    },
    ebitdax: {
      kind: "direct",
      section: "Financial Guidance",
      verbatimBullets: ["2026 Adjusted EBITDA", "~$6.5B"],
      compute: () => ({
        low: 6500,
        high: 6500,
        period: "2026",
        source_text: "2026 Adjusted EBITDA | ~$6.5B (based on recent strip pricing). Note: EQT labels this \"EBITDA,\" not \"EBITDAX,\" in this guidance excerpt.",
        confidence: "medium",
      }),
    },
  },

  EXE: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Production", "7,400–7,600 MMcfe/d"],
      compute: () => ({
        low: 7400 / 1000,
        high: 7600 / 1000,
        period: "2026",
        source_text: "2026 Total Production | 7,400–7,600 MMcfe/d (÷ 1000 = 7.4–7.6 Bcfe/d)",
        confidence: "high",
      }),
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total Capital Investment", "~$2.85B"],
      compute: () => ({
        low: 2850,
        high: 2850,
        period: "2026",
        source_text: "2026 Total Capital Investment | ~$2.85B",
        confidence: "high",
      }),
    },
    // Full model calculation: Production Expense + GP&T + G&A. DD&A excluded — non-cash, correctly
    // out of scope for a cash-cost figure.
    cashUnitCost: {
      kind: "sum",
      components: [
        {
          section: "Operating Costs",
          verbatimBullets: ["Production Expense", "$0.23–$0.28/Mcfe"],
          low: 0.23,
          high: 0.28,
          label: "Production Expense: $0.23–$0.28/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["GP&T Expense", "$0.95–$1.05/Mcfe"],
          low: 0.95,
          high: 1.05,
          label: "GP&T Expense: $0.95–$1.05/Mcfe",
        },
        {
          section: "Operating Costs",
          verbatimBullets: ["General & Administrative", "$0.07–$0.10/Mcfe"],
          low: 0.07,
          high: 0.1,
          label: "General & Administrative: $0.07–$0.10/Mcfe",
        },
      ],
      unit: "$/Mcfe",
      period: "2026",
      confidence: "high",
      note: "Excludes DD&A (non-cash).",
    },
    fcf: null, // no company-wide FCF dollar guidance — see marketingIncrementalFcfTargetMm for the one related (but explicitly non-comparable) figure that does exist
    ebitdax: null,
    marketingIncrementalFcfTargetMm: {
      section: "Marketing / LNG Strategy",
      verbatimBullets: ["Marketing Optimization — Incremental FCF Target", "~$500MM"],
      compute: () => ({
        value: 500,
        unit: "$mm",
        period: "2026",
        source_text: "Marketing Optimization — Incremental FCF Target | ~$500MM",
        confidence: "high",
        note: "One-initiative target (Marketing Optimization), explicitly not company-wide FCF guidance — do not use as EXE's total FCF.",
      }),
    },
  },

  GPOR: {
    production: {
      kind: "direct",
      section: "Production",
      verbatimBullets: ["2026 Total Net Production", "1.03–1.055 Bcfe per day"],
      compute: () => ({
        low: 1.03,
        high: 1.055,
        period: "2026",
        source_text: "2026 Total Net Production | 1.03–1.055 Bcfe per day",
        confidence: "high",
      }),
    },
    capex: {
      kind: "direct",
      section: "Capital Expenditures",
      verbatimBullets: ["2026 Total Operated Capital Expenditures", "$400–$430MM"],
      compute: () => ({
        low: 400,
        high: 430,
        period: "2026",
        source_text: "2026 Total Operated Capital Expenditures | $400–$430MM",
        confidence: "high",
      }),
    },
    cashUnitCost: {
      kind: "direct",
      section: "Operating Costs",
      verbatimBullets: ["2026 Total Unit Cash Costs", "$1.35–$1.48/Mcfe"],
      compute: () => ({
        low: 1.35,
        high: 1.48,
        unit: "$/Mcfe",
        period: "2026",
        source_text:
          "2026 Total Unit Cash Costs | $1.35–$1.48/Mcfe (includes lease operating expense, gathering, processing and transportation, production taxes, and recurring cash G&A)",
        confidence: "high",
      }),
    },
    fcf: null, // GPOR gives FCF only as a growth rate ("More than 40% year-over-year") — no dollar base to convert from; see fcfGrowthRatePct
    ebitdax: null, // explicitly "Not disclosed"
    fcfGrowthRatePct: {
      section: "Financial Guidance",
      verbatimBullets: ["2026 Adjusted Free Cash Flow Growth", "More than 40% year-over-year"],
      compute: () => ({
        value: 40,
        direction: "more than",
        period: "2026 YoY",
        source_text: "2026 Adjusted Free Cash Flow Growth | More than 40% year-over-year",
        confidence: "high",
        note: "Growth rate only, no dollar base disclosed. Could theoretically combine with a historical actual FCF base for a Layer 3 forecast calculation later — not used in Layer 2 normalization.",
      }),
    },
  },
};

function assertVerbatim(guidance: unknown, peer: string, section: string, bullets: string[]): void {
  const companies = (guidance as { companies: Record<string, { sections: Record<string, { text: string }[]> }> }).companies;
  const sectionBullets = companies[peer]?.sections?.[section];
  if (!sectionBullets) {
    throw new Error(`${peer}: section "${section}" not found in guidance.json`);
  }
  const texts = new Set(sectionBullets.map((b) => b.text));
  for (const bullet of bullets) {
    if (!texts.has(bullet)) {
      throw new Error(`${peer}/${section}: cited bullet not found verbatim in guidance.json: "${bullet}"`);
    }
  }
}

function resolveRangeField(spec: RangeFieldSpec | null, guidance: unknown, peer: string): RangeValue | null {
  if (!spec) return null;

  if (spec.kind === "direct") {
    assertVerbatim(guidance, peer, spec.section, spec.verbatimBullets);
    return { ...spec.compute(), classification: "company_guidance" };
  }

  // kind === "sum": a model calculation built from multiple disclosed components.
  let low = 0;
  let high = 0;
  const parts: string[] = [];
  for (const component of spec.components) {
    assertVerbatim(guidance, peer, component.section, component.verbatimBullets);
    low += component.low;
    high += component.high;
    parts.push(component.label);
  }
  // Round away binary floating-point noise (e.g. 0.34 + 0.25 -> 0.5900000000000001) — the
  // source figures never carry more than 2-3 decimal places, so 6 is a safe, lossless margin.
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  low = round(low);
  high = round(high);
  return {
    low,
    high,
    unit: spec.unit,
    period: spec.period,
    source_text: parts.join(" + ") + " (summed by this script — see classification)",
    confidence: spec.confidence,
    classification: "model_calculation",
    ...(spec.partial ? { partial: true } : {}),
    ...(spec.note ? { note: spec.note } : {}),
  };
}

function resolvePointField(spec: PointFieldSpec | undefined, guidance: unknown, peer: string): PointValue | null {
  if (!spec) return null;
  assertVerbatim(guidance, peer, spec.section, spec.verbatimBullets);
  return { ...spec.compute(), classification: "company_guidance" };
}

interface NormalizedPeer {
  production_total_bcfe_per_day: RangeValue | null;
  /** Peer-specific point figure (currently RRC only). NOT equivalent to production_total_bcfe_per_day
   *  (full-year average) — this is a single year-end exit-rate target. Never compare the two directly. */
  production_yearend_target_bcfe_per_day?: PointValue | null;
  capex_total_mm: RangeValue | null;
  cash_unit_cost_total: RangeValue | null;
  financial_guidance: {
    fcf_mm: RangeValue | null;
    ebitdax_mm: RangeValue | null;
  };
  /** One-off, non-comparable extras — never fold into the fields above. */
  marketing_incremental_fcf_target_mm?: PointValue;
  fcf_growth_rate_pct?: PointValue;
}

function main() {
  const guidance = JSON.parse(fs.readFileSync(GUIDANCE_PATH, "utf-8"));

  const report: { peer: string; field: string; confidence: Confidence | "null"; classification: Classification | "n/a" }[] = [];
  const output: Record<string, NormalizedPeer> = {};

  for (const [peer, spec] of Object.entries(PEER_SPECS)) {
    const production = resolveRangeField(spec.production, guidance, peer);
    const productionYearEndTarget = resolvePointField(spec.productionYearEndTarget, guidance, peer);
    const capex = resolveRangeField(spec.capex, guidance, peer);
    const cashUnitCost = resolveRangeField(spec.cashUnitCost, guidance, peer);
    const fcf = resolveRangeField(spec.fcf, guidance, peer);
    const ebitdax = resolveRangeField(spec.ebitdax, guidance, peer);
    const marketingIncrementalFcf = resolvePointField(spec.marketingIncrementalFcfTargetMm, guidance, peer);
    const fcfGrowthRate = resolvePointField(spec.fcfGrowthRatePct, guidance, peer);

    output[peer] = {
      production_total_bcfe_per_day: production,
      ...(productionYearEndTarget ? { production_yearend_target_bcfe_per_day: productionYearEndTarget } : {}),
      capex_total_mm: capex,
      cash_unit_cost_total: cashUnitCost,
      financial_guidance: { fcf_mm: fcf, ebitdax_mm: ebitdax },
      ...(marketingIncrementalFcf ? { marketing_incremental_fcf_target_mm: marketingIncrementalFcf } : {}),
      ...(fcfGrowthRate ? { fcf_growth_rate_pct: fcfGrowthRate } : {}),
    };

    const fields: [string, RangeValue | null][] = [
      ["production_total_bcfe_per_day", production],
      ["capex_total_mm", capex],
      ["cash_unit_cost_total", cashUnitCost],
      ["financial_guidance.fcf_mm", fcf],
      ["financial_guidance.ebitdax_mm", ebitdax],
    ];
    for (const [field, value] of fields) {
      report.push({
        peer,
        field,
        confidence: value?.confidence ?? "null",
        classification: value?.classification ?? "n/a",
      });
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}\n`);

  // --- Report: counts per confidence level per peer ---
  console.log("=== Confidence counts per peer ===");
  for (const peer of Object.keys(PEER_SPECS)) {
    const rows = report.filter((r) => r.peer === peer);
    const counts = { high: 0, medium: 0, low: 0, null: 0 };
    for (const r of rows) counts[r.confidence]++;
    console.log(
      `${peer}: high=${counts.high} medium=${counts.medium} low=${counts.low} null(no defensible value)=${counts.null}`,
    );
  }

  console.log("\n=== Classification counts per peer (company_guidance vs. model_calculation) ===");
  for (const peer of Object.keys(PEER_SPECS)) {
    const rows = report.filter((r) => r.peer === peer && r.classification !== "n/a");
    const counts = { company_guidance: 0, model_calculation: 0 };
    for (const r of rows) counts[r.classification as "company_guidance" | "model_calculation"]++;
    console.log(`${peer}: company_guidance=${counts.company_guidance} model_calculation=${counts.model_calculation}`);
  }

  console.log('\n=== ALL "low"-confidence extractions (review before Layer 3 uses them) ===');
  const lows = report.filter((r) => r.confidence === "low");
  console.log(lows.length === 0 ? "(none)" : lows.map((r) => `${r.peer} / ${r.field}`).join("\n"));

  console.log("\n=== Fields with no defensible value (left null, not estimated) ===");
  const nulls = report.filter((r) => r.confidence === "null");
  for (const r of nulls) {
    console.log(`${r.peer} / ${r.field}`);
  }

  console.log("\n=== model_calculation fields (summed by this script — verify math before use) ===");
  for (const r of report.filter((r) => r.classification === "model_calculation")) {
    const peerData = output[r.peer]!;
    const value =
      r.field === "production_total_bcfe_per_day"
        ? peerData.production_total_bcfe_per_day
        : r.field === "capex_total_mm"
          ? peerData.capex_total_mm
          : r.field === "cash_unit_cost_total"
            ? peerData.cash_unit_cost_total
            : r.field === "financial_guidance.fcf_mm"
              ? peerData.financial_guidance.fcf_mm
              : peerData.financial_guidance.ebitdax_mm;
    console.log(`${r.peer} / ${r.field}: ${JSON.stringify(value)}`);
  }

  console.log(
    "\n=== Peer-specific non-comparable fields (never equate across peers or fold into a main field) ===",
  );
  for (const [peer, peerData] of Object.entries(output)) {
    if (peerData.production_yearend_target_bcfe_per_day) {
      console.log(`${peer} / production_yearend_target_bcfe_per_day: ${JSON.stringify(peerData.production_yearend_target_bcfe_per_day)}`);
    }
    if (peerData.marketing_incremental_fcf_target_mm) {
      console.log(`${peer} / marketing_incremental_fcf_target_mm: ${JSON.stringify(peerData.marketing_incremental_fcf_target_mm)}`);
    }
    if (peerData.fcf_growth_rate_pct) {
      console.log(`${peer} / fcf_growth_rate_pct: ${JSON.stringify(peerData.fcf_growth_rate_pct)}`);
    }
  }
}

main();
