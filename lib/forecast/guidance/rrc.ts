import { rangeMidpoint, type GuidanceEntry } from "@/lib/forecast/guidance/types";

/**
 * Structured RRC management guidance for the 2026E-2028E forecast window.
 *
 * Transcribed directly from data/guidance.json's RRC "Production", "Capital
 * Expenditures", "Operating Costs", "Commodity Realizations / Differentials", and
 * "Financial Targets" sections (source: Peer_Comp_Site_Data/Alphasense/Peer Comp Site
 * 1Q26 Guidance.docx, generated 2026-07-31). Only metrics management actually guided
 * are represented -- there is no entry for a metric/year RRC did not guide (e.g. GP&T
 * is disclosed only as a price sensitivity, not a per-Mcfe guide, so it is intentionally
 * absent here; 2027/2028 LOE, G&A, and differentials are likewise absent because RRC
 * did not separately guide them).
 *
 * This file is a company-config layer, not a generic UI concern: adding AR, CNX, CRK,
 * EQT, EXE, or GPOR later means adding a sibling file with that company's own metrics
 * and years -- the reusable "guidance -> midpoint -> default forecast input" logic in
 * lib/forecast/scenarios/rrc-annual.ts does not need to change.
 */

const SOURCE_NAME = "Range Resources management guidance (Q1 2026)";
const SOURCE_REFERENCE = "Peer Comp Site 1Q26 Guidance (AlphaSense-sourced; verify against company disclosures)";
const SOURCE_DATE = "2026-07-31";

function entry(params: {
  metric: GuidanceEntry["metric"];
  label: string;
  year: GuidanceEntry["year"];
  unit: string;
  low?: number | null;
  high?: number | null;
  point?: number;
  notes?: string;
}): GuidanceEntry {
  const low = params.point !== undefined ? null : params.low ?? null;
  const high = params.point !== undefined ? null : params.high ?? null;
  const midpoint = params.point !== undefined ? params.point : rangeMidpoint(low, high);
  return {
    metric: params.metric,
    label: params.label,
    year: params.year,
    unit: params.unit,
    low,
    high,
    midpoint,
    sourceName: SOURCE_NAME,
    sourceReference: SOURCE_REFERENCE,
    sourceDate: SOURCE_DATE,
    notes: params.notes
  };
}

export const rrcManagementGuidance: GuidanceEntry[] = [
  // --- Production (total company Bcfe/d target) ---
  entry({
    metric: "totalProductionBcfePerDay",
    label: "Total production",
    year: "2026",
    unit: "Bcfe/d",
    point: 2.5,
    notes: "Year-end 2026 target. Q1 2026 actual was 2.2 Bcfe/d; mid-year ramp expected with new processing capacity."
  }),
  entry({
    metric: "totalProductionBcfePerDay",
    label: "Total production",
    year: "2027",
    unit: "Bcfe/d",
    point: 2.6,
    notes: "2027 target."
  }),
  entry({
    metric: "totalProductionBcfePerDay",
    label: "Total production",
    year: "2028",
    unit: "Bcfe/d",
    point: 2.6,
    notes: "2028+ long-term maintenance case. A continued-growth 2028 case is not separately guided by management."
  }),

  // --- CapEx ---
  entry({
    metric: "capexTotalMillion",
    label: "Total capital budget",
    year: "2026",
    unit: "$mm",
    low: 650,
    high: 700,
    notes: "2026 total capital budget."
  }),
  entry({
    metric: "capexTotalMillion",
    label: "Total capital budget",
    year: "2027",
    unit: "$mm",
    low: 650,
    high: 700,
    notes: "\"2026-2027 Annual Capital ~$650-$700MM annually\" -- same guided range applied to 2027; RRC did not issue a distinct 2027 figure."
  }),
  entry({
    metric: "capexTotalMillion",
    label: "Total capital budget",
    year: "2028",
    unit: "$mm",
    point: 600,
    notes: "2028+ maintenance D&C case (~$600MM/year). This is the long-term maintenance total, not a separate growth-case figure."
  }),
  entry({
    metric: "capexMaintenanceDcMillion",
    label: "Maintenance D&C",
    year: "2026",
    unit: "$mm",
    point: 500,
    notes: "2026 maintenance drilling & completion capital."
  }),
  entry({
    metric: "capexGrowthDcMillion",
    label: "Growth D&C",
    year: "2026",
    unit: "$mm",
    low: 120,
    high: 140,
    notes: "2026 growth drilling & completion capital."
  }),
  entry({
    metric: "capexLandLeaseholdMillion",
    label: "Land / acreage",
    year: "2026",
    unit: "$mm",
    low: 15,
    high: 35,
    notes: "2026 land and acreage capital."
  }),
  entry({
    metric: "capexFacilitiesMillion",
    label: "Facilities / software / other",
    year: "2026",
    unit: "$mm",
    low: 15,
    high: 25,
    notes: "2026 facilities, software, and other capital."
  }),

  // --- Costs ---
  entry({
    metric: "loePerMcfe",
    label: "Lease operating expense (LOE)",
    year: "2026",
    unit: "$/Mcfe",
    low: 0.14,
    high: 0.16,
    notes: "2026 LOE guidance."
  }),
  entry({
    metric: "cashGaPerMcfe",
    label: "Cash G&A",
    year: "2026",
    unit: "$/Mcfe",
    point: 0.23,
    notes: "2026 G&A guidance, includes ~$0.05/Mcfe stock-based compensation; management did not separately break out a cash-only figure."
  }),
  entry({
    metric: "cashTaxRate",
    label: "Cash tax rate",
    year: "2026",
    unit: "decimal",
    point: 0.02,
    notes: "2026 cash tax rate guidance. RRC did not issue separate 2027/2028 cash tax guidance."
  }),

  // --- Pricing differentials (reference only; see notes in rrc-complete.ts for how realized pricing is modeled) ---
  entry({
    metric: "gasBasisPerMcf",
    label: "Natural gas differential vs. NYMEX",
    year: "2026",
    unit: "$/Mcf",
    low: -0.45,
    high: -0.35,
    notes: "2026 gas basis guidance vs. NYMEX."
  }),
  entry({
    metric: "oilDifferentialPerBbl",
    label: "Oil / condensate differential vs. WTI",
    year: "2026",
    unit: "$/bbl",
    low: -14.0,
    high: -10.0,
    notes: "2026 oil differential guidance vs. WTI."
  }),
  entry({
    metric: "nglDifferentialPerBbl",
    label: "NGL differential vs. Mont Belvieu",
    year: "2026",
    unit: "$/bbl",
    low: 1.25,
    high: 2.5,
    notes: "2026 NGL differential guidance vs. Mont Belvieu; raised from a prior $0.00 to +$1.00/bbl guide."
  }),

  // --- Management's stated commodity pricing case (used only as the CUSTOM-mode default seed) ---
  entry({
    metric: "henryHubPerMmbtu",
    label: "Henry Hub pricing case",
    year: "2026",
    unit: "$/MMBtu",
    point: 3.75,
    notes: "Management's stated NYMEX natural gas pricing case behind its 2026-2027 cumulative FCF target. Not a price forecast."
  }),
  entry({
    metric: "nglRealizationPerBbl",
    label: "NGL realization pricing case",
    year: "2026",
    unit: "$/bbl",
    point: 24,
    notes: "Management's stated NGL realization case behind its 2026-2027 cumulative FCF target. Not a price forecast."
  })
];
