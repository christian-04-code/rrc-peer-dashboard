/**
 * AR 2026 Management Case: Revenue -> EBITDAX (Layer 3, first model_calculation build).
 *
 * IMPORTANT — SCOPE GAP DISCOVERED WHILE BUILDING THIS (read before trusting the output):
 * This repo has a real, sourced price only for the natural gas stream (Henry Hub spot in
 * data/market-data.json + AR's guided natural gas differential). There is NO Mont Belvieu
 * benchmark price anywhere in this repo (needed for ethane and C3+ NGL) and NO WTI spot price
 * anywhere in this repo (needed for oil) — market-data.json only carries Henry Hub. Volumes for
 * all four streams ARE computed below (see annual_volume_split), but only the gas stream is
 * priced and summed into revenue_mm. ethane_differential, ngl_differential, and
 * oil_condensate_differential all exist and are sourced in differentials_normalized.json — they
 * are carried into inputs_used.excluded_streams for when a Mont Belvieu / WTI source is added,
 * but are NOT used in revenue_mm today. revenue_mm is therefore AR's gas revenue, not AR's total
 * company revenue — see its `note` and `partial: true` flag.
 *
 * ebitdax_mm's cost basis is matched to revenue_mm's basis: cash_unit_cost_total is applied to
 * gas volume only (annualVolumeSplit.natural_gas_bcf), NOT total production across all four
 * streams. An earlier pass used total production as the cost base against gas-only revenue —
 * a mismatched basis that deducted 100%-of-volume costs from ~68%-of-volume revenue and produced
 * a deeply negative, not-meaningful figure. That has been corrected; see ebitdax_mm's `note` for
 * the remaining caveat (assumes AR's blended per-Mcfe cost rate applies uniformly across
 * gas/NGL/oil, which may not hold exactly).
 *
 * Same conventions as normalize-guidance.ts / normalize-differentials.ts: every figure carries an
 * explicit classification and confidence, self-checks guard the hand-entered source figures, and
 * nothing is guessed or interpolated to fill a gap — gaps are left visible instead.
 */

import fs from "node:fs";
import path from "node:path";

const GUIDANCE_NORMALIZED_PATH = path.join(process.cwd(), "data", "guidance_normalized.json");
const DIFFERENTIALS_NORMALIZED_PATH = path.join(process.cwd(), "data", "differentials_normalized.json");
const MARKET_DATA_PATH = path.join(process.cwd(), "data", "market-data.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "forecast_management_case.json");

type Confidence = "high" | "medium" | "low";
/** "live_market_data" added to the guidance/differentials taxonomy — Henry Hub is neither a
 *  company guidance quote nor a derived calculation, it's a dated market data pull. */
type Classification = "company_guidance" | "model_calculation" | "live_market_data";

interface RangeField {
  low: number;
  high: number;
  unit: string;
  period?: string;
  source_text: string;
  confidence: Confidence;
  classification: Classification;
  partial?: boolean;
  note?: string;
}

interface PointField {
  value: number;
  unit?: string;
  source_text: string;
  confidence: Confidence;
  classification: Classification;
  note?: string;
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}
const YEAR_2026_DAYS = daysInYear(2026); // 365 — 2026 is not a leap year

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

function main() {
  const guidanceNormalized = JSON.parse(fs.readFileSync(GUIDANCE_NORMALIZED_PATH, "utf-8"));
  const differentialsNormalized = JSON.parse(fs.readFileSync(DIFFERENTIALS_NORMALIZED_PATH, "utf-8"));
  const marketData = JSON.parse(fs.readFileSync(MARKET_DATA_PATH, "utf-8"));

  const arGuidance = guidanceNormalized.AR;
  const arDifferentials = differentialsNormalized.AR;
  if (!arGuidance || !arDifferentials) {
    throw new Error("AR missing from guidance_normalized.json or differentials_normalized.json");
  }

  // --- Step 1: volume split, all four streams ---

  // Hand-verified from 2026_Q1_AR_10-Q.pdf — not machine-parsed, same convention as
  // normalize-guidance.ts's hand-verified bullets. No self-check possible against the source PDF
  // (not in this repo), so instead we self-check internal consistency: do the four components,
  // converted to Bcfe, sum close to AR's own disclosed combined total?
  const Q1_2026_ACTUAL = {
    natural_gas_bcf: 236,
    ethane_mbbl: 6836,
    c3_plus_ngl_mbbl: 10872,
    oil_mbbl: 816,
    combined_bcfe_disclosed: 347,
    source: "2026_Q1_AR_10-Q.pdf",
  };

  // 6 Mcf per Bbl is the standard gas-equivalent conversion factor — confirmed (not assumed) by
  // the self-check below: it reproduces AR's own disclosed combined total within rounding.
  const MCF_PER_BBL_EQUIVALENT = 6;
  const mcfePerStream = {
    natural_gas: Q1_2026_ACTUAL.natural_gas_bcf * 1000, // Bcf -> MMcf, kept in MMcf-equivalent units throughout
    ethane: (Q1_2026_ACTUAL.ethane_mbbl * 1000 * MCF_PER_BBL_EQUIVALENT) / 1000, // MBbl -> Bbl -> Mcf -> MMcf
    c3_plus_ngl: (Q1_2026_ACTUAL.c3_plus_ngl_mbbl * 1000 * MCF_PER_BBL_EQUIVALENT) / 1000,
    oil: (Q1_2026_ACTUAL.oil_mbbl * 1000 * MCF_PER_BBL_EQUIVALENT) / 1000,
  };
  const combinedBcfeRecomputed =
    (mcfePerStream.natural_gas + mcfePerStream.ethane + mcfePerStream.c3_plus_ngl + mcfePerStream.oil) / 1000; // MMcf -> Bcf

  const combinedDelta = Math.abs(combinedBcfeRecomputed - Q1_2026_ACTUAL.combined_bcfe_disclosed);
  if (combinedDelta > 1) {
    throw new Error(
      `Self-check failed: components sum to ${combinedBcfeRecomputed.toFixed(3)} Bcfe, more than 1 Bcfe from AR's disclosed combined total of ${Q1_2026_ACTUAL.combined_bcfe_disclosed} Bcfe. Re-verify the 10-Q figures before trusting the mix ratios below.`,
    );
  }

  const mixRatios = {
    natural_gas: mcfePerStream.natural_gas / (combinedBcfeRecomputed * 1000),
    ethane: mcfePerStream.ethane / (combinedBcfeRecomputed * 1000),
    c3_plus_ngl: mcfePerStream.c3_plus_ngl / (combinedBcfeRecomputed * 1000),
    oil: mcfePerStream.oil / (combinedBcfeRecomputed * 1000),
  };

  const productionGuidance = arGuidance.production_total_bcfe_per_day;
  if (!productionGuidance) {
    throw new Error("AR production_total_bcfe_per_day is null in guidance_normalized.json — cannot build volume split.");
  }
  // production low === high for AR (single point "~4.1 Bcfe/d" guidance), carried as a range for
  // schema consistency with the rest of this pipeline.
  const annualProductionBcfeLow = productionGuidance.low * YEAR_2026_DAYS;
  const annualProductionBcfeHigh = productionGuidance.high * YEAR_2026_DAYS;

  const annualVolumeSplit = {
    natural_gas_bcf: { low: round(annualProductionBcfeLow * mixRatios.natural_gas, 2), high: round(annualProductionBcfeHigh * mixRatios.natural_gas, 2) },
    ethane_mbbl: {
      low: round(((annualProductionBcfeLow * mixRatios.ethane) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
      high: round(((annualProductionBcfeHigh * mixRatios.ethane) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
    },
    c3_plus_ngl_mbbl: {
      low: round(((annualProductionBcfeLow * mixRatios.c3_plus_ngl) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
      high: round(((annualProductionBcfeHigh * mixRatios.c3_plus_ngl) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
    },
    oil_mbbl: {
      low: round(((annualProductionBcfeLow * mixRatios.oil) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
      high: round(((annualProductionBcfeHigh * mixRatios.oil) * 1000) / MCF_PER_BBL_EQUIVALENT, 1),
    },
  };

  // --- Step 2: price the gas stream (the only stream with a real benchmark in this repo) ---

  const henryHub = marketData.henry_hub_daily_spot_price_usd_per_mmbtu as Record<string, number>;
  const latestHHDate = Object.keys(henryHub).sort().at(-1);
  if (!latestHHDate) throw new Error("No Henry Hub spot prices found in market-data.json");
  const henryHubSpot = henryHub[latestHHDate] as number;

  const gasDiff = arDifferentials.natural_gas_differential;
  if (!gasDiff) throw new Error("AR natural_gas_differential missing from differentials_normalized.json");

  const gasPricePerMcf: RangeField = {
    low: round(henryHubSpot + gasDiff.low, 4),
    high: round(henryHubSpot + gasDiff.high, 4),
    unit: "$/Mcf",
    period: "2026",
    source_text: `Henry Hub spot $${henryHubSpot}/MMBtu (${latestHHDate}, data/market-data.json) + AR guided natural gas differential +$${gasDiff.low}-$${gasDiff.high}/Mcf vs. NYMEX Henry Hub (data/differentials_normalized.json)`,
    confidence: "medium",
    classification: "model_calculation",
    note: "Henry Hub is quoted in $/MMBtu; this treats $/MMBtu as numerically equal to $/Mcf per common industry shorthand. Pipeline-quality natural gas is typically ~1.02-1.035 MMBtu per Mcf, so this introduces a small, un-adjusted ~2-4% approximation — not a Btu-content-adjusted price.",
  };

  const gasAnnualMcfLow = annualVolumeSplit.natural_gas_bcf.low * 1_000_000;
  const gasAnnualMcfHigh = annualVolumeSplit.natural_gas_bcf.high * 1_000_000;

  // Revenue range: pair (low volume x low price) and (high volume x high price). AR's production
  // guidance is a single point (low===high) so volume contributes no width here — all revenue
  // range width currently comes from the guided differential's low-high spread.
  const gasRevenueMMLow = round((gasAnnualMcfLow * gasPricePerMcf.low) / 1_000_000, 1);
  const gasRevenueMMHigh = round((gasAnnualMcfHigh * gasPricePerMcf.high) / 1_000_000, 1);

  const revenue_mm: RangeField = {
    low: gasRevenueMMLow,
    high: gasRevenueMMHigh,
    unit: "$mm",
    period: "2026 (annualized from full-year guided production)",
    source_text: `Natural gas stream only: ${round(gasAnnualMcfLow / 1000, 1)}-${round(gasAnnualMcfHigh / 1000, 1)} MMcf annual volume x $${gasPricePerMcf.low}-$${gasPricePerMcf.high}/Mcf realized price`,
    confidence: "medium",
    classification: "model_calculation",
    partial: true,
    note: "This is AR's GAS-STREAM revenue only, not total company revenue. Ethane, C3+ NGL, and oil volumes are computed (see inputs_used.annual_volume_split) but are NOT priced or included here — this repo has no Mont Belvieu benchmark price (needed for ethane/NGL) and no WTI spot price (needed for oil) anywhere in market-data.json. See inputs_used.excluded_streams for the sourced differentials that exist and are ready to use once those benchmarks are added.",
  };

  // --- Step 4: EBITDAX — cost basis matched to revenue basis (gas volume only, NOT total
  // production across all 4 streams). Using total production here would deduct 100%-of-volume
  // costs against ~68%-of-volume (gas-only) revenue — a mismatched basis that produced a deeply
  // negative, not-meaningful figure in an earlier pass. Corrected per explicit instruction.

  const cashUnitCost = arGuidance.cash_unit_cost_total;
  if (!cashUnitCost) throw new Error("AR cash_unit_cost_total is null in guidance_normalized.json");

  // $/Mcfe x Bcf(gas, ~= Bcfe for a dry-gas stream) cancels to $mm directly (Bcfe = 1e6 Mcfe, $mm
  // = $1e6) — written out with the intermediate Mcfe step for auditability rather than relying on
  // that cancellation silently. Uses gas_volume_only (annualVolumeSplit.natural_gas_bcf), not
  // totalAnnualMcfe across all 4 streams.
  const gasAnnualMcfeLow = annualVolumeSplit.natural_gas_bcf.low * 1_000_000;
  const gasAnnualMcfeHigh = annualVolumeSplit.natural_gas_bcf.high * 1_000_000;
  const costMMLow = round((cashUnitCost.low * gasAnnualMcfeLow) / 1_000_000, 1);
  const costMMHigh = round((cashUnitCost.high * gasAnnualMcfeHigh) / 1_000_000, 1);

  // Floor = low revenue minus high cost; ceiling = high revenue minus low cost — the widest
  // defensible range given independent (uncorrelated) guided ranges for revenue and cost.
  const ebitdaxMMLow = round(revenue_mm.low - costMMHigh, 1);
  const ebitdaxMMHigh = round(revenue_mm.high - costMMLow, 1);

  const ebitdax_mm: RangeField = {
    low: ebitdaxMMLow,
    high: ebitdaxMMHigh,
    unit: "$mm",
    period: "2026",
    source_text: `revenue_mm ($${revenue_mm.low}-$${revenue_mm.high}MM, gas-stream only) minus cash_unit_cost_total ($${cashUnitCost.low}-$${cashUnitCost.high}/Mcfe) x gas volume only (${round(annualVolumeSplit.natural_gas_bcf.low, 1)}-${round(annualVolumeSplit.natural_gas_bcf.high, 1)} Bcf, NOT total production) = $${costMMLow}-$${costMMHigh}MM`,
    confidence: "low",
    classification: "model_calculation",
    partial: true,
    note: "Gas-only Revenue minus gas-only share of costs (cash_unit_cost_total applied to gas volume only, not total production, to keep revenue/cost on the same basis). Assumes AR's blended per-Mcfe cost rate applies uniformly across gas/NGL/oil — may not hold exactly. Ethane/C3+NGL/oil revenue and cost shares excluded entirely, same reasons as revenue_mm.",
  };

  // --- inputs_used ---

  const excludedStreamNote = (stream: string, benchmark: string) =>
    `${stream} volume is computed in annual_volume_split, and AR's own guided differential exists in differentials_normalized.json, but this repo has no ${benchmark} benchmark spot price anywhere — so ${stream.toLowerCase()} is excluded from revenue_mm entirely, not estimated.`;

  const output = {
    AR: {
      revenue_mm,
      ebitdax_mm,
      inputs_used: {
        production_guidance_bcfe_per_day: productionGuidance,
        annual_production_bcfe: {
          low: round(annualProductionBcfeLow, 1),
          high: round(annualProductionBcfeHigh, 1),
          unit: "Bcfe",
          source_text: `${productionGuidance.low}-${productionGuidance.high} Bcfe/d x ${YEAR_2026_DAYS} days (2026 is not a leap year)`,
          confidence: "high",
          classification: "model_calculation",
        } as RangeField,
        q1_2026_actual_commodity_mix: {
          ...Q1_2026_ACTUAL,
          combined_bcfe_recomputed_from_components: round(combinedBcfeRecomputed, 3),
          conversion_factor_note: `6 Mcf-equivalent per Bbl applied to ethane/C3+NGL/oil MBbl figures; recomputed combined total (${round(combinedBcfeRecomputed, 3)} Bcfe) matches AR's own disclosed combined total (${Q1_2026_ACTUAL.combined_bcfe_disclosed} Bcfe) within ${round(combinedDelta, 3)} Bcfe — confirms the conversion factor rather than assuming it.`,
        },
        computed_mix_ratios: {
          natural_gas: round(mixRatios.natural_gas, 6),
          ethane: round(mixRatios.ethane, 6),
          c3_plus_ngl: round(mixRatios.c3_plus_ngl, 6),
          oil: round(mixRatios.oil, 6),
          classification: "model_calculation" as Classification,
          confidence: "medium" as Confidence,
          note: "Volume split applies AR's actual Q1 2026 commodity mix (from 10-Q) to 2026 full-year guided production — mix may shift over the year, not a company disclosure.",
        },
        annual_volume_split: annualVolumeSplit,
        henry_hub_spot: {
          value: henryHubSpot,
          unit: "$/MMBtu",
          date: latestHHDate,
          source_text: "data/market-data.json henry_hub_daily_spot_price_usd_per_mmbtu, most recent date available",
          confidence: "high" as Confidence,
          classification: "live_market_data" as Classification,
        } as PointField & { date: string },
        natural_gas_differential: gasDiff,
        gas_price_per_mcf: gasPricePerMcf,
        cash_unit_cost_total: cashUnitCost,
        excluded_streams: {
          ethane: {
            differential: arDifferentials.ethane_differential ?? null,
            excluded_because: excludedStreamNote("Ethane", "Mont Belvieu"),
          },
          c3_plus_ngl: {
            differential: arDifferentials.ngl_differential ?? null,
            excluded_because: excludedStreamNote("C3+ NGL", "Mont Belvieu"),
          },
          oil: {
            differential: arDifferentials.oil_condensate_differential ?? null,
            excluded_because: excludedStreamNote("Oil", "WTI"),
          },
        },
      },
    },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}\n`);

  console.log("=== AR 2026 Management Case summary ===");
  console.log(`Revenue (gas-stream only, partial): $${revenue_mm.low}MM - $${revenue_mm.high}MM`);
  console.log(`EBITDAX (gas-only revenue vs. gas-only cost share): $${ebitdax_mm.low}MM - $${ebitdax_mm.high}MM`);
  console.log(`Mix ratios (Q1 2026 actual, applied to FY26 guided production):`);
  console.log(`  Gas: ${round(mixRatios.natural_gas * 100, 1)}%  Ethane: ${round(mixRatios.ethane * 100, 1)}%  C3+ NGL: ${round(mixRatios.c3_plus_ngl * 100, 1)}%  Oil: ${round(mixRatios.oil * 100, 1)}%`);
  console.log(`Self-check: components sum to ${round(combinedBcfeRecomputed, 3)} Bcfe vs. AR's disclosed ${Q1_2026_ACTUAL.combined_bcfe_disclosed} Bcfe (delta ${round(combinedDelta, 3)} Bcfe)`);
}

main();
