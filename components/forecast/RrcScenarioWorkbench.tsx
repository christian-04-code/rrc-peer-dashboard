"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketData } from "@/lib/market/use-market-data";
import { extractLiveMarketMetricsFromMarketResponse, resolveCommoditySources } from "@/lib/forecast/live-market-prices";
import type { RrcForecastYear } from "@/lib/forecast/scenarios/rrc-annual";

const YEARS: RrcForecastYear[] = ["2026", "2027", "2028"];

/** 2026 blends Q1/Q2 2026 immutable reported actuals with a Q3/Q4 2026 estimate; 2027/2028 are fully estimated years. */
function yearLabel(year: RrcForecastYear): string {
  return year === "2026" ? "2026E (H1 Actual + H2E)" : `${year}E`;
}
const PRESET_MULTIPLES = { bear: 4.5, base: 5.5, bull: 6.5 } as const;
type Preset = keyof typeof PRESET_MULTIPLES;
type Strategy = "maintenance" | "continued-growth";
type CommodityMode = "current-market" | "custom";
type Classification = "reported" | "guided" | "modeled" | "live" | "user";

type ResolvedAnnualValue = {
  value: number | null;
  classification: Classification;
  sourceName: string;
  sourceReference: string;
  sourceDate: string;
  notes: string;
};

type GuidanceEntry = {
  metric: string;
  label: string;
  year: RrcForecastYear;
  unit: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  sourceName: string;
  sourceReference: string;
  sourceDate: string;
  notes?: string;
};

type AnnualPeriodSummary = {
  year: RrcForecastYear;
  production: { gasMmcf: number | null; nglMbbl: number | null; oilMbbl: number | null; totalMcfe: number | null };
  revenueMillion: number | null;
  ebitdaxMillion: number | null;
  capexMillion: number | null;
  freeCashFlowMillion: number | null;
  fcfYield: number | null;
};

type ValuationResult = {
  enterpriseValueMillion: number | null;
  equityValueMillion: number | null;
  impliedSharePrice: number | null;
  warnings: string[];
  forwardYear: RrcForecastYear;
  forwardEbitdaxMillion: number | null;
  netDebtMillion: number | null;
  forecastEndingNetDebtMillion: number | null;
  valuationNetDebtFloorApplied: boolean;
  netDebtPeriod: string;
  ebitdaxPeriod: string;
  dilutedSharesMillion: number | null;
};

type DcfResult = {
  presentValueForecastMillion: number | null;
  terminalValueMillion: number | null;
  enterpriseValueMillion: number | null;
  equityValueMillion: number | null;
  impliedSharePrice: number | null;
  warnings: string[];
  discountRate: number;
  terminalGrowthRate: number;
};

type AnnualForecastResult = {
  strategy: Strategy;
  annual: Record<RrcForecastYear, AnnualPeriodSummary>;
  productionResolution: Record<RrcForecastYear, ResolvedAnnualValue>;
  valuation: ValuationResult;
  dcf: DcfResult;
  notes: string[];
};

type ApiDefaults = {
  latestReportedProduction: { period: string; sourceLabel: string; gasMmcfPerDay: number | null; nglMbblPerDay: number | null; oilMbblPerDay: number | null };
  guidance: GuidanceEntry[];
  productionDefaults: Record<RrcForecastYear, ResolvedAnnualValue>;
  costDefaults: Record<RrcForecastYear, { loePerMcfe: ResolvedAnnualValue; cashGaPerMcfe: ResolvedAnnualValue; cashTaxRate: ResolvedAnnualValue }>;
  capexDefaults: Record<RrcForecastYear, ResolvedAnnualValue>;
  pricingDefaults: Record<RrcForecastYear, { gasBasisPerMcf: ResolvedAnnualValue; oilDifferentialPerBbl: ResolvedAnnualValue }>;
  currentNetDebtMillion: number | null;
  dilutedSharesMillion: number | null;
  result: AnnualForecastResult;
};

type CostField = "loePerMcfe" | "gatheringTransportPerMcfe" | "cashGaPerMcfe" | "explorationMillion" | "cashInterestMillion" | "cashTaxRate";
type PricingField = "gasBasisPerMcf" | "oilDifferentialPerBbl";

const EMPTY_YEAR_STRINGS = { "2026": "", "2027": "", "2028": "" } as Record<RrcForecastYear, string>;

function emptyCostYear(): Record<CostField, string> {
  return { loePerMcfe: "", gatheringTransportPerMcfe: "", cashGaPerMcfe: "", explorationMillion: "", cashInterestMillion: "", cashTaxRate: "" };
}

function emptyPricingYear(): Record<PricingField, string> {
  return { gasBasisPerMcf: "", oilDifferentialPerBbl: "" };
}

const CLASSIFICATION_STYLE: Record<Classification, { label: string; bg: string; color: string }> = {
  reported: { label: "Reported", bg: "rgba(112,201,154,.16)", color: "var(--positive)" },
  guided: { label: "Guidance", bg: "rgba(64,140,220,.18)", color: "#6badf0" },
  live: { label: "Current Market", bg: "rgba(40,180,120,.18)", color: "#3fd493" },
  modeled: { label: "Modeled", bg: "rgba(240,180,40,.16)", color: "#e5ad63" },
  user: { label: "User Input", bg: "rgba(178,130,240,.18)", color: "#b98cf2" }
};

function ClassificationPill({ classification }: { classification: Classification }) {
  const style = CLASSIFICATION_STYLE[classification];
  return (
    <span className="ann-pill" style={{ background: style.bg, color: style.color }}>
      {style.label}
    </span>
  );
}

function money(value: number | null, digits = 1) {
  return value === null || value === undefined ? "--" : `$${value.toFixed(digits)}`;
}

function num(value: number | null, digits = 2) {
  return value === null || value === undefined ? "--" : value.toFixed(digits);
}

function pct(value: number | null, digits = 1) {
  return value === null || value === undefined ? "--" : `${(value * 100).toFixed(digits)}%`;
}

function parsedOrUndefined(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const CORE_GUIDANCE_METRICS = new Set(["totalProductionBcfePerDay", "capexTotalMillion", "loePerMcfe", "cashGaPerMcfe", "cashTaxRate"]);

function GuidanceRangeCell({ entry }: { entry: GuidanceEntry | undefined }) {
  if (!entry || entry.midpoint === null) return <span className="muted">--</span>;
  const range = entry.low !== null && entry.high !== null ? `${entry.low} - ${entry.high} ` : "";
  return (
    <span>
      {range}
      <strong>{entry.midpoint} {entry.unit}</strong>
      {range ? <span className="muted"> mid</span> : null}
    </span>
  );
}

function ManagementGuidancePanel({ guidance }: { guidance: GuidanceEntry[] }) {
  if (guidance.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Management guidance</h2></div>
        <p className="muted">No structured management guidance is available for this company.</p>
      </section>
    );
  }

  const byMetric = new Map<string, GuidanceEntry[]>();
  for (const entry of guidance) {
    if (!byMetric.has(entry.metric)) byMetric.set(entry.metric, []);
    byMetric.get(entry.metric)!.push(entry);
  }
  const coreMetrics = [...byMetric.entries()].filter(([metric]) => CORE_GUIDANCE_METRICS.has(metric));
  const otherMetrics = [...byMetric.entries()].filter(([metric]) => !CORE_GUIDANCE_METRICS.has(metric));

  function metricRow([metric, entries]: [string, GuidanceEntry[]]) {
    const byYear = Object.fromEntries(entries.map((e) => [e.year, e]));
    return (
      <tr key={metric}>
        <th align="left">{entries[0].label}</th>
        {YEARS.map((year) => <td key={year}><GuidanceRangeCell entry={byYear[year]} /></td>)}
      </tr>
    );
  }

  const source = guidance[0];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Management guidance</h2>
        <span className="badge">Reference</span>
      </div>
      <p className="muted panel-note" style={{ marginTop: -6 }}>
        Reference layer only. Guided midpoints become the default forecast input below when a range or target exists for that year -- nothing here is invented for a metric management did not guide.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="forecast-table ann-guidance-table">
          <thead><tr><th align="left">Metric</th>{YEARS.map((year) => <th key={year} align="left">{year}E</th>)}</tr></thead>
          <tbody>{coreMetrics.map(metricRow)}</tbody>
        </table>
      </div>
      {otherMetrics.length > 0 ? (
        <details className="ann-details">
          <summary>View all guidance ({otherMetrics.length} more metrics)</summary>
          <div style={{ overflowX: "auto" }}>
            <table className="forecast-table ann-guidance-table">
              <thead><tr><th align="left">Metric</th>{YEARS.map((year) => <th key={year} align="left">{year}E</th>)}</tr></thead>
              <tbody>{otherMetrics.map(metricRow)}</tbody>
            </table>
          </div>
        </details>
      ) : null}
      <p className="muted panel-note">
        {source.sourceName} · {source.sourceReference} · {source.sourceDate}
      </p>
    </section>
  );
}

export function RrcScenarioWorkbench() {
  const market = useMarketData();
  const liveCommodity = useMemo(() => extractLiveMarketMetricsFromMarketResponse(market.data), [market.data]);
  const commoditySources = useMemo(() => resolveCommoditySources(market.data), [market.data]);

  const [defaults, setDefaults] = useState<ApiDefaults | null>(null);
  const [result, setResult] = useState<AnnualForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<Strategy>("maintenance");
  const [preset, setPreset] = useState<Preset>("base");
  const [multiple, setMultiple] = useState<string>(String(PRESET_MULTIPLES.base));
  const [forwardYear, setForwardYear] = useState<RrcForecastYear>("2027");

  const [commodityMode, setCommodityMode] = useState<CommodityMode>("current-market");
  const [customHenryHub, setCustomHenryHub] = useState("");
  const [customWti, setCustomWti] = useState("");
  const [customNgl, setCustomNgl] = useState("");

  const [production, setProduction] = useState<Record<RrcForecastYear, string>>({ ...EMPTY_YEAR_STRINGS });
  const [costs, setCosts] = useState<Record<RrcForecastYear, Record<CostField, string>>>({
    "2026": emptyCostYear(),
    "2027": emptyCostYear(),
    "2028": emptyCostYear()
  });
  const [capex, setCapex] = useState<Record<RrcForecastYear, string>>({ ...EMPTY_YEAR_STRINGS });
  const [pricing, setPricing] = useState<Record<RrcForecastYear, Record<PricingField, string>>>({
    "2026": emptyPricingYear(),
    "2027": emptyPricingYear(),
    "2028": emptyPricingYear()
  });

  useEffect(() => {
    fetch("/api/rrc-scenarios")
      .then((response) => response.json())
      .then((data: ApiDefaults) => {
        setDefaults(data);
        setResult(data.result);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => setMultiple(String(PRESET_MULTIPLES[preset])), [preset]);

  async function runForecast() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rrc-scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy,
          production: Object.fromEntries(
            YEARS.map((year) => [year, { totalBcfePerDay: parsedOrUndefined(production[year]) }])
          ),
          costs: Object.fromEntries(
            YEARS.map((year) => [
              year,
              Object.fromEntries(
                (Object.keys(costs[year]) as CostField[]).map((field) => [field, parsedOrUndefined(costs[year][field])])
              )
            ])
          ),
          capex: Object.fromEntries(YEARS.map((year) => [year, { totalMillion: parsedOrUndefined(capex[year]) }])),
          pricing: Object.fromEntries(
            YEARS.map((year) => [
              year,
              Object.fromEntries(
                (Object.keys(pricing[year]) as PricingField[]).map((field) => [field, parsedOrUndefined(pricing[year][field])])
              )
            ])
          ),
          commodityMode,
          customCommodity: {
            henryHubPerMmbtu: parsedOrUndefined(customHenryHub),
            wtiPerBbl: parsedOrUndefined(customWti),
            nglPerBbl: parsedOrUndefined(customNgl)
          },
          liveCommodity,
          valuation: {
            targetEvToEbitdax: parsedOrUndefined(multiple) ?? PRESET_MULTIPLES[preset],
            forwardYear
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Forecast calculation failed.");
      setResult(payload.result as AnnualForecastResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Forecast calculation failed.");
    } finally {
      setLoading(false);
    }
  }

  function productionClassification(year: RrcForecastYear): Classification {
    if (production[year].trim() !== "") return "user";
    return defaults?.productionDefaults[year]?.classification ?? "modeled";
  }

  function costClassification(year: RrcForecastYear, field: CostField): Classification {
    if (costs[year][field].trim() !== "") return "user";
    if (field === "loePerMcfe") return defaults?.costDefaults[year]?.loePerMcfe.classification ?? "modeled";
    if (field === "cashGaPerMcfe") return defaults?.costDefaults[year]?.cashGaPerMcfe.classification ?? "modeled";
    if (field === "cashTaxRate") return defaults?.costDefaults[year]?.cashTaxRate.classification ?? "modeled";
    return "modeled";
  }

  function capexClassification(year: RrcForecastYear): Classification {
    if (capex[year].trim() !== "") return "user";
    return defaults?.capexDefaults[year]?.classification ?? "modeled";
  }

  function pricingClassification(year: RrcForecastYear, field: PricingField): Classification {
    if (pricing[year][field].trim() !== "") return "user";
    return defaults?.pricingDefaults[year]?.[field]?.classification ?? "modeled";
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px", display: "grid", gap: 16 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>RANGE RESOURCES</p>
        <h1 style={{ margin: "4px 0 8px" }}>Forecast</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Given management&apos;s operating outlook and either current commodity prices or your own assumptions,
          what could RRC generate in Revenue, EBITDAX, and FCF -- and what is it worth at a selected EV/EBITDAX multiple?
        </p>
      </header>

      {defaults ? <ManagementGuidancePanel guidance={defaults.guidance} /> : null}

      <section className="panel">
        <div className="panel-head"><h2>Model assumptions</h2></div>

        <h3 className="wb-group-title" style={{ marginTop: 4 }}>Production (total company, Bcfe/d)</h3>
        <div className="ann-year-grid">
          {YEARS.map((year) => (
            <label className="wb-field" key={year}>
              <span className="wb-field-label">
                {yearLabel(year)} <ClassificationPill classification={productionClassification(year)} />
              </span>
              <input
                type="number"
                step="0.01"
                placeholder={defaults?.productionDefaults[year]?.value !== null && defaults?.productionDefaults[year]?.value !== undefined ? String(defaults.productionDefaults[year].value) : "--"}
                value={production[year]}
                onChange={(event) => setProduction((prev) => ({ ...prev, [year]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="muted panel-note">
          Default = management guidance midpoint/target when RRC guided that year, otherwise the latest reported total held flat. Editing a year classifies it User Input.
          For 2026, this is the full-year target -- Q1/Q2 are locked to actual reported production, and Q3/Q4 are solved so the full year reconciles to this figure.
        </p>

        <h3 className="wb-group-title">Commodity price mode</h3>
        <div className="wb-groups" style={{ marginBottom: 8 }}>
          <label className="wb-field">
            Mode
            <select value={commodityMode} onChange={(event) => setCommodityMode(event.target.value as CommodityMode)}>
              <option value="current-market">Current market</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        {commodityMode === "current-market" ? (
          <div>
            <div className="wb-latest-stats">
              <div className="wb-latest-stat">
                <span>Henry Hub</span>
                <strong>{num(commoditySources.henryHub.value)} <small>$/MMBtu</small></strong>
                <ClassificationPill classification="live" />
              </div>
              <div className="wb-latest-stat">
                <span>WTI</span>
                <strong>{num(commoditySources.wti.value)} <small>$/bbl</small></strong>
                <ClassificationPill classification="live" />
              </div>
            </div>
            <p className="muted panel-note">Spot-price sensitivity -- not a forward curve. Held flat across 2026E-2028E. Source: OilPriceAPI, EIA fallback.</p>
          </div>
        ) : (
          <div className="ann-year-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
            <label className="wb-field">Henry Hub ($/MMBtu)<input type="number" step="0.01" placeholder="3.75" value={customHenryHub} onChange={(event) => setCustomHenryHub(event.target.value)} /></label>
            <label className="wb-field">WTI ($/bbl)<input type="number" step="0.01" placeholder="65" value={customWti} onChange={(event) => setCustomWti(event.target.value)} /></label>
            <label className="wb-field">NGL realization ($/bbl)<input type="number" step="0.01" placeholder="24" value={customNgl} onChange={(event) => setCustomNgl(event.target.value)} /></label>
          </div>
        )}

        <h3 className="wb-group-title">Costs</h3>
        {YEARS.map((year) => (
          <div className="wb-year-group" key={year}>
            <p className="wb-year-label">{yearLabel(year)}</p>
            <div className="ann-year-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <label className="wb-field">
                <span className="wb-field-label">LOE $/Mcfe <ClassificationPill classification={costClassification(year, "loePerMcfe")} /></span>
                <input type="number" step="0.01" placeholder={num(defaults?.costDefaults[year]?.loePerMcfe.value ?? null)} value={costs[year].loePerMcfe} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], loePerMcfe: event.target.value } }))} />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">GP&amp;T $/Mcfe <ClassificationPill classification={costClassification(year, "gatheringTransportPerMcfe")} /></span>
                <input type="number" step="0.01" placeholder="1.63" value={costs[year].gatheringTransportPerMcfe} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], gatheringTransportPerMcfe: event.target.value } }))} />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">G&amp;A $/Mcfe <ClassificationPill classification={costClassification(year, "cashGaPerMcfe")} /></span>
                <input type="number" step="0.01" placeholder={defaults?.costDefaults[year]?.cashGaPerMcfe.value !== null && defaults?.costDefaults[year]?.cashGaPerMcfe.value !== undefined ? num(defaults.costDefaults[year].cashGaPerMcfe.value) : "--"} value={costs[year].cashGaPerMcfe} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], cashGaPerMcfe: event.target.value } }))} />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">Exploration $mm <ClassificationPill classification={costClassification(year, "explorationMillion")} /></span>
                <input type="number" step="0.1" placeholder="6.03" value={costs[year].explorationMillion} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], explorationMillion: event.target.value } }))} />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">Cash interest $mm <ClassificationPill classification={costClassification(year, "cashInterestMillion")} /></span>
                <input type="number" step="0.1" placeholder="19.42" value={costs[year].cashInterestMillion} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], cashInterestMillion: event.target.value } }))} />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">Cash tax rate <ClassificationPill classification={costClassification(year, "cashTaxRate")} /></span>
                <input type="number" step="0.01" placeholder={num(defaults?.costDefaults[year]?.cashTaxRate.value ?? null)} value={costs[year].cashTaxRate} onChange={(event) => setCosts((prev) => ({ ...prev, [year]: { ...prev[year], cashTaxRate: event.target.value } }))} />
              </label>
            </div>
          </div>
        ))}

        <h3 className="wb-group-title">CapEx (total, $mm)</h3>
        <div className="ann-year-grid">
          {YEARS.map((year) => (
            <label className="wb-field" key={year}>
              <span className="wb-field-label">
                {yearLabel(year)} <ClassificationPill classification={capexClassification(year)} />
              </span>
              <input
                type="number"
                step="1"
                placeholder={defaults?.capexDefaults[year]?.value !== null && defaults?.capexDefaults[year]?.value !== undefined ? String(defaults.capexDefaults[year].value) : "--"}
                value={capex[year]}
                onChange={(event) => setCapex((prev) => ({ ...prev, [year]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="muted panel-note">Evenly allocated across quarters internally; the quarterly engine is unchanged. For 2026, this is the full-year target -- Q1/Q2 use actual reported CapEx, and the remainder is split evenly across Q3/Q4.</p>

        <h3 className="wb-group-title">Realized pricing differentials</h3>
        {YEARS.map((year) => (
          <div className="wb-year-group" key={year}>
            <p className="wb-year-label">{yearLabel(year)}</p>
            <div className="ann-year-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <label className="wb-field">
                <span className="wb-field-label">Gas differential vs. NYMEX $/Mcf <ClassificationPill classification={pricingClassification(year, "gasBasisPerMcf")} /></span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={num(defaults?.pricingDefaults[year]?.gasBasisPerMcf.value ?? null)}
                  value={pricing[year].gasBasisPerMcf}
                  onChange={(event) => setPricing((prev) => ({ ...prev, [year]: { ...prev[year], gasBasisPerMcf: event.target.value } }))}
                />
              </label>
              <label className="wb-field">
                <span className="wb-field-label">Oil differential vs. WTI $/bbl <ClassificationPill classification={pricingClassification(year, "oilDifferentialPerBbl")} /></span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={num(defaults?.pricingDefaults[year]?.oilDifferentialPerBbl.value ?? null)}
                  value={pricing[year].oilDifferentialPerBbl}
                  onChange={(event) => setPricing((prev) => ({ ...prev, [year]: { ...prev[year], oilDifferentialPerBbl: event.target.value } }))}
                />
              </label>
            </div>
          </div>
        ))}
        <p className="muted panel-note">Realized gas price = Henry Hub + gas differential. Realized oil price = WTI + oil differential. Sign exactly as disclosed by management.</p>

        <h3 className="wb-group-title">Valuation</h3>
        <div className="wb-groups">
          <div className="wb-group">
            <label className="wb-field">
              Post-2027 strategy
              <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
                <option value="maintenance">Maintenance</option>
                <option value="continued-growth">Continued growth</option>
              </select>
            </label>
            <label className="wb-field">
              Forward EBITDAX year
              <select value={forwardYear} onChange={(event) => setForwardYear(event.target.value as RrcForecastYear)}>
                {YEARS.map((year) => <option key={year} value={year}>{year}E</option>)}
              </select>
            </label>
          </div>
          <div className="wb-group">
            <label className="wb-field">
              Scenario preset
              <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
                <option value="bear">Bear</option>
                <option value="base">Base</option>
                <option value="bull">Bull</option>
              </select>
            </label>
            <label className="wb-field">
              Target EV / EBITDAX
              <span className="wb-suffix-input">
                <input type="number" step="0.1" value={multiple} onChange={(event) => setMultiple(event.target.value)} />
                <span>x</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => void runForecast()} disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "Calculating…" : "Run forecast"}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      {result ? (
        <>
          <section className="wb-section">
            <h2>Annual forecast</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="forecast-table">
                <thead>
                  <tr><th align="left">Metric</th>{YEARS.map((year) => <th key={year} align="right">{yearLabel(year)}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><td>Production (Bcfe/d avg)</td>{YEARS.map((year) => <td key={year} align="right">{result.annual[year].production.totalMcfe === null ? "--" : num(result.annual[year].production.totalMcfe / 365 / 1000, 2)}</td>)}</tr>
                  <tr><td>Revenue</td>{YEARS.map((year) => <td key={year} align="right">{money(result.annual[year].revenueMillion)}</td>)}</tr>
                  <tr><td>EBITDAX</td>{YEARS.map((year) => <td key={year} align="right">{money(result.annual[year].ebitdaxMillion)}</td>)}</tr>
                  <tr><td>CapEx</td>{YEARS.map((year) => <td key={year} align="right">{money(result.annual[year].capexMillion)}</td>)}</tr>
                  <tr><td>Free cash flow</td>{YEARS.map((year) => <td key={year} align="right">{money(result.annual[year].freeCashFlowMillion)}</td>)}</tr>
                  <tr><td>FCF yield</td>{YEARS.map((year) => <td key={year} align="right">{pct(result.annual[year].fcfYield)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="muted panel-note">Production x realized commodity prices → Revenue → cash operating costs → EBITDAX → interest / cash taxes / CapEx → FCF.</p>
            <p className="muted panel-note">2026E = Q1 2026 actual + Q2 2026 actual (immutable reported quarters) + Q3/Q4 2026 estimate. 2027E and 2028E are fully estimated years.</p>
          </section>

          <section className="wb-result-rows">
            <section className="wb-result-grid">
              <div className="wb-result-card"><small>Enterprise value</small><strong>{money(result.valuation.enterpriseValueMillion)}</strong></div>
              <div className="wb-result-card"><small>Equity value</small><strong>{money(result.valuation.equityValueMillion)}</strong></div>
              <div className="wb-result-card"><small>Implied share price</small><strong>{money(result.valuation.impliedSharePrice, 2)}</strong></div>
              <div className="wb-result-card"><small>{result.valuation.forwardYear}E EBITDAX x multiple</small><strong>{money(result.valuation.forwardEbitdaxMillion)} <small style={{ fontWeight: 400 }}>at {multiple}x</small></strong></div>
            </section>
            <p className="muted panel-note">
              EV = {result.valuation.ebitdaxPeriod} EBITDAX x target multiple. Equity value = EV - net debt at {result.valuation.netDebtPeriod} ({money(result.valuation.netDebtMillion)}).
              Implied share price = equity value / {num(result.valuation.dilutedSharesMillion, 3)}mm diluted shares. Net debt and EBITDAX are read from the same period end.
            </p>
            <p className="muted panel-note">
              Forecast ending net debt/net cash at {result.valuation.netDebtPeriod}: {money(result.valuation.forecastEndingNetDebtMillion)} (negative = net cash; unaffected by the convention below).
              {result.valuation.valuationNetDebtFloorApplied ? " Valuation net debt is floored at $0; unallocated forecast excess cash is not credited to implied equity value, since this model does not simulate buybacks, special dividends, acquisitions, or other capital allocation of unmodeled excess free cash flow." : null}
            </p>
            {result.valuation.warnings.length > 0 ? <p className="muted panel-note">{result.valuation.warnings.join(" ")}</p> : null}
          </section>

          <details className="ann-details">
            <summary>Advanced: DCF (secondary)</summary>
            <section className="wb-result-grid" style={{ marginTop: 10 }}>
              <div className="wb-result-card"><small>DCF enterprise value</small><strong>{money(result.dcf.enterpriseValueMillion)}</strong></div>
              <div className="wb-result-card"><small>DCF equity value</small><strong>{money(result.dcf.equityValueMillion)}</strong></div>
              <div className="wb-result-card"><small>DCF implied share price</small><strong>{money(result.dcf.impliedSharePrice, 2)}</strong></div>
            </section>
            <p className="muted panel-note">
              {pct(result.dcf.discountRate, 0)} discount rate, {pct(result.dcf.terminalGrowthRate, 0)} terminal growth, uses today&apos;s reported net debt (not a future ending net debt).
              Secondary output -- EV/EBITDAX above is the primary valuation method for this page.
            </p>
          </details>
        </>
      ) : null}

      <p style={{ fontSize: 12, opacity: 0.65 }}>
        Every input above is classified Reported, Guidance, Current Market, Modeled, or User Input. Unsupported or missing values render &quot;--&quot;; nothing is fabricated.
      </p>
    </main>
  );
}
