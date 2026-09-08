import { formatPct } from "@/lib/market/macro-analytics";

/**
 * Phase 6D deterministic Range Macro risk engine. This file is the one
 * source of truth for "what is currently a risk/watch/supportive factor for
 * Range" -- AI (lib/market/ai/) only explains signals this file already
 * computed; it is never asked to rank or invent them. Every signal here
 * reuses a driver key already defined in the shared Range taxonomy
 * (lib/range-impact-framework.ts) rather than inventing new ones, and every
 * numeric input is a value this project already computes and displays
 * elsewhere (Phase 6C's Macro tabs) -- nothing here recalculates anything
 * from raw EIA rows.
 *
 * Deliberately excluded (see docs/CURRENT_HANDOFF.md's Phase 6D section for
 * the full reasoning): weather/HDD-CDD (no validated series located as of
 * Phase 6B/6C), appalachian_takeaway/regional basis differentials (no
 * validated data source in this project), ngl_demand and regulation (not
 * requested and no validated quantitative series). Adding placeholder
 * signals for these merely to fill the widget would misrepresent them as
 * evaluated when they are not.
 */

export type RangeMacroSignalKey =
  | "gas_pricing"
  | "storage_levels"
  | "us_gas_supply"
  | "appalachia_supply"
  | "lng_demand"
  | "power_data_center_demand"
  | "industrial_demand";

export type RangeMacroSignalPriority = "primary" | "secondary";

/**
 * A single ordinal scale, worst to best -- not two independent risk/opportunity
 * axes. HIGH_RISK/MODERATE_RISK/WATCH describe increasingly mild downside
 * pressure; SUPPORTIVE describes a tailwind. UNAVAILABLE means the required
 * input data could not be computed (never guessed, never zero-filled).
 */
export type RangeMacroSignalState = "HIGH_RISK" | "MODERATE_RISK" | "WATCH" | "SUPPORTIVE" | "UNAVAILABLE";

export const RANGE_MACRO_SIGNAL_STATE_ORDER: RangeMacroSignalState[] = ["HIGH_RISK", "MODERATE_RISK", "WATCH", "SUPPORTIVE"];

export type RangeMacroSignalMetric = { label: string; value: string };

export type RangeMacroSignal = {
  driver: RangeMacroSignalKey;
  label: string;
  priority: RangeMacroSignalPriority;
  state: RangeMacroSignalState;
  /** Signed percentage: positive = directionally supportive for Range's gas-price realizations, negative = directionally adverse. Null when the underlying data is unavailable. Not a probability or a confidence score -- purely the classification input. */
  pressurePct: number | null;
  metrics: RangeMacroSignalMetric[];
  reason: string;
  /** The most recent data period the classification is based on -- for on-widget freshness display, not part of the classification itself. */
  period: string | null;
};

/**
 * Range-specific priority tiers (Section 7). Primary drivers are the ones
 * with the most direct, well-established link to Range's realized gas price
 * and Appalachian supply position; secondary drivers are real but one step
 * removed (regional power/industrial demand growth matters, but less
 * directly than price, storage, national supply, regional supply, and LNG
 * demand). Qualitative tiers, not invented numeric weights -- used only as
 * a tie-breaker in ranking (see rankRangeMacroSignals).
 */
export const RANGE_MACRO_SIGNAL_PRIORITY: Record<RangeMacroSignalKey, RangeMacroSignalPriority> = {
  gas_pricing: "primary",
  storage_levels: "primary",
  us_gas_supply: "primary",
  appalachia_supply: "primary",
  lng_demand: "primary",
  power_data_center_demand: "secondary",
  industrial_demand: "secondary"
};

const RANGE_MACRO_SIGNAL_LABELS: Record<RangeMacroSignalKey, string> = {
  gas_pricing: "Natural Gas Pricing",
  storage_levels: "Storage",
  us_gas_supply: "U.S. Gas Supply",
  appalachia_supply: "Appalachia Supply",
  lng_demand: "LNG Demand",
  power_data_center_demand: "Power Demand",
  industrial_demand: "Industrial Demand"
};

/**
 * Thresholds are the same +/-5% relative-deviation convention this project
 * already uses and tests for storage/LNG/gas-balance classification
 * (classifyGasBalance in macro-analytics.ts) -- reused here for consistency
 * of interpretation across the app, not a new invented number. HIGH is a
 * natural doubling (+/-10%) rather than a separately-tuned cutoff.
 */
const MODERATE_THRESHOLD_PCT = 5;
const HIGH_THRESHOLD_PCT = 10;

export function classifySignalMagnitude(pressurePct: number | null): RangeMacroSignalState {
  if (pressurePct === null) return "UNAVAILABLE";
  if (pressurePct <= -HIGH_THRESHOLD_PCT) return "HIGH_RISK";
  if (pressurePct <= -MODERATE_THRESHOLD_PCT) return "MODERATE_RISK";
  if (pressurePct < MODERATE_THRESHOLD_PCT) return "WATCH";
  return "SUPPORTIVE";
}

function qualifier(state: RangeMacroSignalState, supportivePhrase: string, watchPhrase: string, moderatePhrase: string, highPhrase: string): string {
  switch (state) {
    case "SUPPORTIVE": return supportivePhrase;
    case "WATCH": return watchPhrase;
    case "MODERATE_RISK": return moderatePhrase;
    case "HIGH_RISK": return highPhrase;
    default: return "";
  }
}

export type ForecastDirection = "rising" | "falling" | "flat" | null;

/**
 * Compares an EIA STEO forecast's near-term value to its horizon-end value
 * using the same +/-5% threshold as everything else here. Deliberately
 * qualitative (rising/falling/flat), never blended numerically with the
 * actual-based pressurePct above -- keeps the classification rule
 * transparent (one clear number drives the state) while still surfacing
 * the forecast as context in the reason text, per Section 6's "future
 * forecast direction" request.
 */
export function classifyForecastDirection(nearValue: number | null, farValue: number | null): ForecastDirection {
  if (nearValue === null || farValue === null || nearValue === 0) return null;
  const pct = ((farValue - nearValue) / Math.abs(nearValue)) * 100;
  if (pct >= MODERATE_THRESHOLD_PCT) return "rising";
  if (pct <= -MODERATE_THRESHOLD_PCT) return "falling";
  return "flat";
}

export type RangeMacroSignalInputs = {
  henryHub: { trendPct: number | null; value: number | null; period: string | null };
  storage: { vs5yrPct: number | null; value: number | null; period: string | null };
  usGasSupply: { yoyPct: number | null; value: number | null; period: string | null };
  appalachiaSupply: { yoyPct: number | null; value: number | null; period: string | null; statesIncluded: string[] };
  lngDemand: { yoyPct: number | null; value: number | null; period: string | null; forecastDirection: ForecastDirection };
  powerDemand: { yoyPct: number | null; value: number | null; period: string | null };
  industrialDemand: { yoyPct: number | null; value: number | null; period: string | null; forecastDirection: ForecastDirection };
};

function metricOrUnavailable(label: string, value: number | null, unit: string, digits = 1): RangeMacroSignalMetric {
  return { label, value: value === null ? "--" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${unit}` };
}

function pctMetric(label: string, pct: number | null): RangeMacroSignalMetric {
  return { label, value: formatPct(pct) };
}

/**
 * Builds all 7 signals every time, including UNAVAILABLE ones when an input
 * is null -- callers (rankRangeMacroSignals) filter those out for display,
 * but the full set stays observable here for tests and for the AI payload's
 * transparency about what could and couldn't be evaluated this run.
 */
export function buildRangeMacroSignals(inputs: RangeMacroSignalInputs): RangeMacroSignal[] {
  const gasPricingPressure = inputs.henryHub.trendPct;
  const gasPricingState = classifySignalMagnitude(gasPricingPressure);

  const storagePressure = inputs.storage.vs5yrPct === null ? null : -inputs.storage.vs5yrPct;
  const storageState = classifySignalMagnitude(storagePressure);

  const usGasSupplyPressure = inputs.usGasSupply.yoyPct === null ? null : -inputs.usGasSupply.yoyPct;
  const usGasSupplyState = classifySignalMagnitude(usGasSupplyPressure);

  const appalachiaPressure = inputs.appalachiaSupply.yoyPct === null ? null : -inputs.appalachiaSupply.yoyPct;
  const appalachiaState = classifySignalMagnitude(appalachiaPressure);

  const lngPressure = inputs.lngDemand.yoyPct;
  const lngState = classifySignalMagnitude(lngPressure);

  const powerPressure = inputs.powerDemand.yoyPct;
  const powerState = classifySignalMagnitude(powerPressure);

  const industrialPressure = inputs.industrialDemand.yoyPct;
  const industrialState = classifySignalMagnitude(industrialPressure);

  return [
    {
      driver: "gas_pricing",
      label: RANGE_MACRO_SIGNAL_LABELS.gas_pricing,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.gas_pricing,
      state: gasPricingState,
      pressurePct: gasPricingPressure,
      period: inputs.henryHub.period,
      metrics: [metricOrUnavailable("Henry Hub", inputs.henryHub.value, "$/MMBtu", 2), pctMetric("30-observation trend", gasPricingPressure)],
      reason: gasPricingState === "UNAVAILABLE"
        ? "Henry Hub trend data is currently unavailable."
        : `Henry Hub is ${formatPct(gasPricingPressure)} over the latest 30 daily observations, ${qualifier(gasPricingState,
            "a supportive near-term trend for Range's realized gas price.",
            "not yet a clear directional signal for Range's realized gas price.",
            "a moderate near-term headwind for Range's realized gas price.",
            "a sharp near-term headwind for Range's realized gas price."
          )}`
    },
    {
      driver: "storage_levels",
      label: RANGE_MACRO_SIGNAL_LABELS.storage_levels,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.storage_levels,
      state: storageState,
      pressurePct: storagePressure,
      period: inputs.storage.period,
      metrics: [metricOrUnavailable("Working gas storage", inputs.storage.value, "Bcf", 0), pctMetric("vs 5-year average", inputs.storage.vs5yrPct)],
      reason: storageState === "UNAVAILABLE"
        ? "Storage deviation data is currently unavailable."
        : `Storage is ${formatPct(inputs.storage.vs5yrPct)} versus its five-year average, ${qualifier(storageState,
            "a tight balance that is directionally supportive for gas pricing.",
            "close to normal, not a clear price signal on its own.",
            "a moderate surplus that can pressure near-term gas pricing.",
            "a large surplus that is a significant headwind for near-term gas pricing."
          )}`
    },
    {
      driver: "us_gas_supply",
      label: RANGE_MACRO_SIGNAL_LABELS.us_gas_supply,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.us_gas_supply,
      state: usGasSupplyState,
      pressurePct: usGasSupplyPressure,
      period: inputs.usGasSupply.period,
      metrics: [metricOrUnavailable("U.S. dry gas production", inputs.usGasSupply.value, "Bcf/d", 1), pctMetric("year over year", inputs.usGasSupply.yoyPct)],
      reason: usGasSupplyState === "UNAVAILABLE"
        ? "U.S. dry gas production trend data is currently unavailable."
        : `U.S. dry gas production is ${formatPct(inputs.usGasSupply.yoyPct)} year over year, ${qualifier(usGasSupplyState,
            "supply growth cooling enough to be directionally supportive for the broader gas balance.",
            "not yet a clear signal for the broader gas balance.",
            "supply growth that can loosen the broader gas balance and pressure pricing.",
            "supply growth accelerating enough to be a significant pressure on the broader gas balance."
          )}`
    },
    {
      driver: "appalachia_supply",
      label: RANGE_MACRO_SIGNAL_LABELS.appalachia_supply,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.appalachia_supply,
      state: appalachiaState,
      pressurePct: appalachiaPressure,
      period: inputs.appalachiaSupply.period,
      metrics: [metricOrUnavailable("PA + WV + OH marketed production", inputs.appalachiaSupply.value, "MMcf/mo", 0), pctMetric("year over year", inputs.appalachiaSupply.yoyPct)],
      reason: appalachiaState === "UNAVAILABLE"
        ? "PA + WV + OH marketed production trend data is currently unavailable."
        : `PA + WV + OH marketed production is ${formatPct(inputs.appalachiaSupply.yoyPct)} year over year, ${qualifier(appalachiaState,
            "regional supply growth easing enough to be directionally supportive for regional takeaway/basis competition.",
            "not yet a clear signal for regional takeaway/basis competition.",
            "regional supply growth that can increase competition for regional takeaway capacity.",
            "regional supply growth accelerating enough to be a significant pressure on regional takeaway capacity and basis."
          )}`
    },
    {
      driver: "lng_demand",
      label: RANGE_MACRO_SIGNAL_LABELS.lng_demand,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.lng_demand,
      state: lngState,
      pressurePct: lngPressure,
      period: inputs.lngDemand.period,
      metrics: [metricOrUnavailable("U.S. LNG exports", inputs.lngDemand.value, "MMcf/mo", 0), pctMetric("year over year", inputs.lngDemand.yoyPct)],
      reason: (lngState === "UNAVAILABLE"
        ? "U.S. LNG export trend data is currently unavailable."
        : `U.S. LNG exports are ${formatPct(inputs.lngDemand.yoyPct)} year over year, ${qualifier(lngState,
            "a supportive source of structural natural-gas demand.",
            "not yet a clear directional signal.",
            "a moderate reduction in a key source of structural natural-gas demand.",
            "a sharp reduction in a key source of structural natural-gas demand."
          )}`) + (inputs.lngDemand.forecastDirection ? ` EIA's STEO forecast horizon is ${inputs.lngDemand.forecastDirection} for this series.` : "")
    },
    {
      driver: "power_data_center_demand",
      label: RANGE_MACRO_SIGNAL_LABELS.power_data_center_demand,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.power_data_center_demand,
      state: powerState,
      pressurePct: powerPressure,
      period: inputs.powerDemand.period,
      metrics: [metricOrUnavailable("Electric power gas demand", inputs.powerDemand.value, "MMcf/mo", 0), pctMetric("year over year", inputs.powerDemand.yoyPct)],
      reason: powerState === "UNAVAILABLE"
        ? "Electric power sector gas demand trend data is currently unavailable."
        : `Electric power sector gas demand is ${formatPct(inputs.powerDemand.yoyPct)} year over year, ${qualifier(powerState,
            "a supportive incremental source of gas demand.",
            "not yet a clear directional signal.",
            "a moderate reduction in an incremental source of gas demand.",
            "a sharp reduction in an incremental source of gas demand."
          )} EIA's STEO power-sector forecast is tracked separately (Phase 6C left it forecast-only; its unit convention could not be safely combined with this actual figure).`
    },
    {
      driver: "industrial_demand",
      label: RANGE_MACRO_SIGNAL_LABELS.industrial_demand,
      priority: RANGE_MACRO_SIGNAL_PRIORITY.industrial_demand,
      state: industrialState,
      pressurePct: industrialPressure,
      period: inputs.industrialDemand.period,
      metrics: [metricOrUnavailable("Industrial gas demand", inputs.industrialDemand.value, "MMcf/mo", 0), pctMetric("year over year", inputs.industrialDemand.yoyPct)],
      reason: (industrialState === "UNAVAILABLE"
        ? "Industrial gas demand trend data is currently unavailable."
        : `Industrial gas demand is ${formatPct(inputs.industrialDemand.yoyPct)} year over year, ${qualifier(industrialState,
            "a supportive incremental source of gas demand.",
            "not yet a clear directional signal.",
            "a moderate reduction in an incremental source of gas demand.",
            "a sharp reduction in an incremental source of gas demand."
          )}`) + (inputs.industrialDemand.forecastDirection ? ` EIA's STEO forecast horizon is ${inputs.industrialDemand.forecastDirection} for this series.` : "")
    }
  ];
}

/**
 * Deterministic ranking (Section 8): primarily by state in the fixed order
 * HIGH_RISK > MODERATE_RISK > WATCH > SUPPORTIVE, then by Range-priority
 * tier (primary before secondary), then alphabetically by driver key as the
 * final deterministic tie-break. UNAVAILABLE signals are excluded (nothing
 * to rank). Section 11 requires the widget not be only-negative: if the
 * top `maxItems` slice contains no SUPPORTIVE signal but at least one exists
 * anywhere in the full ranking, the single best-ranked SUPPORTIVE signal
 * replaces the lowest-ranked item in the slice.
 */
export function rankRangeMacroSignals(signals: RangeMacroSignal[], maxItems = 5): RangeMacroSignal[] {
  const available = signals.filter((signal) => signal.state !== "UNAVAILABLE");

  const sorted = [...available].sort((a, b) => {
    const stateDelta = RANGE_MACRO_SIGNAL_STATE_ORDER.indexOf(a.state) - RANGE_MACRO_SIGNAL_STATE_ORDER.indexOf(b.state);
    if (stateDelta !== 0) return stateDelta;
    const priorityDelta = (a.priority === "primary" ? 0 : 1) - (b.priority === "primary" ? 0 : 1);
    if (priorityDelta !== 0) return priorityDelta;
    return a.driver.localeCompare(b.driver);
  });

  const slice = sorted.slice(0, maxItems);
  const hasSupportive = slice.some((signal) => signal.state === "SUPPORTIVE");
  const bestSupportive = sorted.find((signal) => signal.state === "SUPPORTIVE");

  if (!hasSupportive && bestSupportive && slice.length >= maxItems && maxItems > 0) {
    slice[slice.length - 1] = bestSupportive;
  } else if (!hasSupportive && bestSupportive && slice.length < maxItems) {
    slice.push(bestSupportive);
  }

  return slice;
}

export const RANGE_MACRO_RISK_SCHEMA_VERSION = "1.0.0";

export type MacroRiskPayloadSignal = {
  driver: RangeMacroSignalKey;
  label: string;
  state: RangeMacroSignalState;
  priority: RangeMacroSignalPriority;
  rank: number;
  metrics: RangeMacroSignalMetric[];
  period: string | null;
  deterministicReason: string;
};

export type MacroRiskPayload = {
  schemaVersion: string;
  /** Latest data period among all included signals -- a data-intrinsic marker, deliberately never a wall-clock fetch timestamp, so the same underlying EIA data always fingerprints identically regardless of when it happens to be fetched (Section 16: fingerprint on normalized inputs, not rendering/retrieval circumstance). */
  snapshotAsOf: string | null;
  /** The ranked (top-N) signals, in rank order -- what the AI should lead with. */
  signals: MacroRiskPayloadSignal[];
  /** All 7 evaluated signals (including ones outside the top-N), keyed by driver, for AI context beyond just the headline ranking. UNAVAILABLE signals are omitted, never included as a fabricated zero/neutral reading. */
  supportingMetrics: Partial<Record<RangeMacroSignalKey, { state: RangeMacroSignalState; period: string | null; metrics: RangeMacroSignalMetric[] }>>;
};

/**
 * Builds the exact structured payload sent to the AI provider and fingerprinted
 * for caching (Section 13). rankedSignals should be rankRangeMacroSignals's
 * output; allSignals should be buildRangeMacroSignals's full (unranked, includes
 * UNAVAILABLE) output, so supportingMetrics can offer fuller context than just
 * the top-N without re-deriving anything.
 */
export function buildMacroRiskPayload(rankedSignals: RangeMacroSignal[], allSignals: RangeMacroSignal[]): MacroRiskPayload {
  const periods = [...rankedSignals, ...allSignals].map((signal) => signal.period).filter((period): period is string => period !== null);
  const snapshotAsOf = periods.length ? periods.sort().reverse()[0] : null;

  const supportingMetrics: MacroRiskPayload["supportingMetrics"] = {};
  for (const signal of allSignals) {
    if (signal.state === "UNAVAILABLE") continue;
    supportingMetrics[signal.driver] = { state: signal.state, period: signal.period, metrics: signal.metrics };
  }

  return {
    schemaVersion: RANGE_MACRO_RISK_SCHEMA_VERSION,
    snapshotAsOf,
    signals: rankedSignals.map((signal, index) => ({
      driver: signal.driver,
      label: signal.label,
      state: signal.state,
      priority: signal.priority,
      rank: index + 1,
      metrics: signal.metrics,
      period: signal.period,
      deterministicReason: signal.reason
    })),
    supportingMetrics
  };
}

export type RangeMacroSignalChange = {
  driver: RangeMacroSignalKey;
  label: string;
  fromState: RangeMacroSignalState;
  toState: RangeMacroSignalState;
};

/**
 * Deterministic state-change detection (Section 20) between the current
 * payload's supportingMetrics and a previously-persisted payload's -- never
 * AI-generated, never fabricated before a real prior snapshot exists. A
 * driver missing from either side (was/is UNAVAILABLE, or wasn't evaluated
 * that run) is skipped rather than treated as a change from/to nothing.
 */
export function computeSignalChanges(currentPayload: MacroRiskPayload, previousPayload: MacroRiskPayload | null): RangeMacroSignalChange[] {
  if (!previousPayload) return [];
  const changes: RangeMacroSignalChange[] = [];
  const driverKeys = Object.keys(currentPayload.supportingMetrics) as RangeMacroSignalKey[];
  for (const driver of driverKeys.sort()) {
    const current = currentPayload.supportingMetrics[driver];
    const previous = previousPayload.supportingMetrics[driver];
    if (!current || !previous) continue;
    if (current.state !== previous.state) {
      changes.push({ driver, label: RANGE_MACRO_SIGNAL_LABELS[driver], fromState: previous.state, toState: current.state });
    }
  }
  return changes;
}
