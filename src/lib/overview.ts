import "server-only";
import { getHistoricalData, getMarketData } from "./data";
import { CORE_PEER_ORDER } from "./constants";
import { getCorePeerValues, getMetric, getValue, median, rankDescending, type PeerValue } from "./metrics";
import { getElectricDemandTile, getHenryHubTile, getPropaneTile, getStorageTiles, type BackdropTile } from "./market";
import type { DataClassification, Quarter } from "./types";

export interface ScorecardCardData {
  name: string;
  unit: string;
  classification: DataClassification;
  reportedOrCalculated: "reported" | "calculated";
  rrcValue: number | null;
  peerMedian: number | null;
  deltaVsMedianPct: number | null;
  higherIsBetter: boolean;
  rows: { ticker: string; value: number | null; isRRC: boolean; isMedian?: boolean }[];
}

export interface RankedBarDatum {
  ticker: string;
  value: number | null;
  isRRC: boolean;
}

export interface TrendSeries {
  ticker: string;
  isRRC: boolean;
  points: { quarter: Quarter; value: number | null }[];
}

export interface ScatterPoint {
  ticker: string;
  isRRC: boolean;
  x: number | null; // leverage
  y: number | null; // FCF yield
}

export interface RankingRow {
  ticker: string;
  name: string;
  isRRC: boolean;
  ebitdax: number | null;
  fcf: number | null;
  leverage: number | null;
  productionGrowth: number | null;
  rank: number | null;
}

export interface OverviewData {
  asOfQuarter: Quarter;
  corePeers: string[];
  backdropTiles: BackdropTile[];
  scorecard: ScorecardCardData[];
  ebitdaxBars: RankedBarDatum[];
  ebitdaxBarMedian: number | null;
  ebitdaxBarClassification: DataClassification;
  trendSeries: TrendSeries[];
  trendQuarters: Quarter[];
  trendClassification: DataClassification;
  scatter: ScatterPoint[];
  scatterClassification: DataClassification;
  rankingTable: RankingRow[];
  rankingClassification: DataClassification;
}

const SCORECARD_CONFIG: {
  name: string;
  metricName: string;
  group: "metrics" | "normalized_metrics";
  higherIsBetter: boolean;
}[] = [
  { name: "Adjusted EBITDAX", metricName: "Adjusted EBITDAX", group: "metrics", higherIsBetter: true },
  { name: "Free Cash Flow", metricName: "Free Cash Flow", group: "metrics", higherIsBetter: true },
  {
    name: "Net Debt / LTM EBITDAX",
    metricName: "Normalized Net Debt / LTM EBITDAX",
    group: "normalized_metrics",
    higherIsBetter: false,
  },
  {
    name: "Production Growth (YoY)",
    metricName: "YoY Production Growth",
    group: "normalized_metrics",
    higherIsBetter: true,
  },
  { name: "Total Cash Unit Cost", metricName: "Total Cash Unit Costs", group: "metrics", higherIsBetter: false },
  { name: "Realized Gas Price", metricName: "Realized Natural Gas Price", group: "metrics", higherIsBetter: true },
  {
    name: "EV / LTM EBITDAX",
    metricName: "EV / LTM Normalized EBITDAX",
    group: "normalized_metrics",
    higherIsBetter: false,
  },
];

function buildScorecard(historical: ReturnType<typeof getHistoricalData>, quarter: Quarter): ScorecardCardData[] {
  return SCORECARD_CONFIG.map((cfg) => {
    const peerValues = getCorePeerValues(historical.companies, cfg.metricName, quarter, cfg.group);
    const rrcEntry = peerValues.find((p) => p.isRRC);
    const rrcValue = rrcEntry?.value ?? null;
    const med = median(peerValues.map((p) => p.value));
    const deltaVsMedianPct = rrcValue !== null && med !== null && med !== 0 ? ((rrcValue - med) / Math.abs(med)) * 100 : null;

    // Top 2 peers (excluding RRC) ranked in the "better" direction, plus RRC and median.
    const others = peerValues.filter((p) => !p.isRRC && p.value !== null) as (PeerValue & { value: number })[];
    const sorted = [...others].sort((a, b) => (cfg.higherIsBetter ? b.value - a.value : a.value - b.value));
    const top2 = sorted.slice(0, 2);

    const rrcMetric = historical.companies.RRC ? getMetric(historical.companies.RRC, cfg.metricName, cfg.group) : undefined;

    return {
      name: cfg.name,
      unit: rrcMetric?.unit ?? "",
      classification: rrcMetric?.classification ?? "Company-Reported Historical (Actual)",
      reportedOrCalculated: rrcMetric?.reported_or_calculated ?? "reported",
      rrcValue,
      peerMedian: med,
      deltaVsMedianPct,
      higherIsBetter: cfg.higherIsBetter,
      rows: [
        { ticker: "RRC", value: rrcValue, isRRC: true },
        ...top2.map((p) => ({ ticker: p.ticker, value: p.value, isRRC: false })),
        { ticker: "median", value: med, isRRC: false, isMedian: true },
      ],
    };
  });
}

export function buildOverviewData(): OverviewData {
  const historical = getHistoricalData();
  const market = getMarketData();
  const quarters = historical.meta.quarters;
  const asOfQuarter = quarters[quarters.length - 1] as Quarter;

  const backdropTiles: BackdropTile[] = [
    getHenryHubTile(market),
    getPropaneTile(market),
    getStorageTiles(market).level,
    getStorageTiles(market).build,
    getElectricDemandTile(market),
  ];

  const scorecard = buildScorecard(historical, asOfQuarter);

  const ebitdaxPeerValues = getCorePeerValues(historical.companies, "Adjusted EBITDAX", asOfQuarter, "metrics");
  const ebitdaxRanked = rankDescending(ebitdaxPeerValues);
  const ebitdaxBars: RankedBarDatum[] = [...ebitdaxRanked]
    .sort((a, b) => {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    })
    .map((p) => ({ ticker: p.ticker, value: p.value, isRRC: p.isRRC }));
  const ebitdaxBarMedian = median(ebitdaxPeerValues.map((p) => p.value));
  const rrcEbitdaxMetric = getMetric(historical.companies.RRC as never, "Adjusted EBITDAX", "metrics");

  const trendSeries: TrendSeries[] = CORE_PEER_ORDER.map((ticker) => {
    const company = historical.companies[ticker];
    return {
      ticker,
      isRRC: ticker === "RRC",
      points: quarters.map((q) => ({
        quarter: q,
        value: company ? getValue(company, "Adjusted EBITDAX", q, "metrics") : null,
      })),
    };
  });

  const leverageValues = getCorePeerValues(
    historical.companies,
    "Normalized Net Debt / LTM EBITDAX",
    asOfQuarter,
    "normalized_metrics",
  );
  const fcfYieldValues = getCorePeerValues(historical.companies, "Normalized FCF Yield", asOfQuarter, "normalized_metrics");
  const scatter: ScatterPoint[] = CORE_PEER_ORDER.map((ticker) => {
    const x = leverageValues.find((p) => p.ticker === ticker)?.value ?? null;
    const y = fcfYieldValues.find((p) => p.ticker === ticker)?.value ?? null;
    return { ticker, isRRC: ticker === "RRC", x, y };
  });
  const scatterMetric = getMetric(historical.companies.RRC as never, "Normalized Net Debt / LTM EBITDAX", "normalized_metrics");

  const fcfValues = getCorePeerValues(historical.companies, "Free Cash Flow", asOfQuarter, "metrics");
  const growthValues = getCorePeerValues(historical.companies, "YoY Production Growth", asOfQuarter, "normalized_metrics");
  const rankingRanked = rankDescending(ebitdaxPeerValues);
  const rankingTable: RankingRow[] = [...rankingRanked]
    .sort((a, b) => {
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    })
    .map((row) => ({
      ticker: row.ticker,
      name: historical.companies[row.ticker]?.name ?? row.ticker,
      isRRC: row.isRRC,
      ebitdax: row.value,
      fcf: fcfValues.find((p) => p.ticker === row.ticker)?.value ?? null,
      leverage: leverageValues.find((p) => p.ticker === row.ticker)?.value ?? null,
      productionGrowth: growthValues.find((p) => p.ticker === row.ticker)?.value ?? null,
      rank: row.rank,
    }));

  return {
    asOfQuarter,
    corePeers: [...CORE_PEER_ORDER],
    backdropTiles,
    scorecard,
    ebitdaxBars,
    ebitdaxBarMedian,
    ebitdaxBarClassification: rrcEbitdaxMetric?.classification ?? "Company-Reported Historical (Actual)",
    trendSeries,
    trendQuarters: quarters,
    trendClassification: rrcEbitdaxMetric?.classification ?? "Company-Reported Historical (Actual)",
    scatter,
    scatterClassification: scatterMetric?.classification ?? "Company-Reported Historical (Actual)",
    rankingTable,
    rankingClassification: rrcEbitdaxMetric?.classification ?? "Company-Reported Historical (Actual)",
  };
}
