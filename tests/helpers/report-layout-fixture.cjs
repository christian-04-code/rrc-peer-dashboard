/**
 * Layout regression fixture for the five-page weekly report (2026-10-14).
 *
 * Payload: Range/peer/valuation/forecast/rigs evidence comes from the repo's
 * own static adapters (the same public-filing data the real report uses); the
 * market modules come from the existing sample fixture, plus synthetic chart
 * series and the four risk-engine rows a real week produced. No live fetch.
 *
 * AI responses: synthetic text sized to (a) the prompt's targets ("compliant")
 * and (b) the longest fields observed in a real Preview response, or the
 * validator ceilings where those are higher ("worst case"). The real Preview
 * output itself is not committed (public repository).
 */
const { load } = require("./ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { collectRangeCompanyEvidence } = load("lib/reports/adapters/range-company-adapter.ts");
const { collectPeersEvidence } = load("lib/reports/adapters/peers-adapter.ts");
const { collectValuationEvidence } = load("lib/reports/adapters/valuation-adapter.ts");
const { collectForecastEvidence } = load("lib/reports/adapters/forecast-adapter.ts");
const { collectRigsEvidence } = load("lib/reports/adapters/rigs-adapter.ts");

const NOW = new Date("2026-10-14T16:00:00Z");
const WORDS = "Range gas prices storage supply demand Henry Hub Appalachia hedges takeaway cash flow forecast LNG feedgas producers basis winter weather output market report week quarter guidance".split(" ");

/** Plain prose of roughly `chars` characters, split into `sentences` sentences (each ending with "."). */
function prose(chars, sentences = 1, seed = 0) {
  const per = Math.max(20, Math.floor(chars / sentences));
  const out = [];
  for (let s = 0; s < sentences; s += 1) {
    let text = s === 0 ? "U.S." : "Range";
    let i = seed + s * 7;
    while (text.length < per - 8) text += ` ${WORDS[i++ % WORDS.length]}`;
    out.push(`${text} $3.03.`);
  }
  return out.join(" ").slice(0, chars - 1).replace(/\s*\S*$/, "") + ".";
}

function words(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(WORDS[i % WORDS.length]);
  return out;
}

/** 2-3 paragraph summary of exactly `count` words. */
function summary(count) {
  const w = words(count);
  const a = Math.floor(count * 0.45);
  const b = Math.floor(count * 0.8);
  return `${w.slice(0, a).join(" ")}.\n\n${w.slice(a, b).join(" ")}.\n\n${w.slice(b).join(" ")}.`;
}

function riskItem(driver, label, state, rank) {
  return {
    evidenceId: `deterministic_risk_opportunity:${driver}`, category: "deterministic_risk_opportunity", metricKey: driver, label,
    currentValue: 1, displayValue: state, unit: "%", period: "2026-10-02", asOfDate: "2026-10-02", sourceIds: [], freshness: "current",
    comparisons: [], rangeDrivers: [driver],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: rank, riskState: state, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: { riskRank: rank, riskState: state, deterministicReason: prose(150, 1, rank) }
  };
}

function series(n, start, step, fn) {
  return Array.from({ length: n }, (_, i) => ({ period: new Date(Date.parse(start) + i * step * 864e5).toISOString().slice(0, 10), value: fn(i) }));
}

function buildLayoutPayload() {
  const range = collectRangeCompanyEvidence(NOW);
  const peers = collectPeersEvidence();
  const valuation = collectValuationEvidence();
  const forecast = collectForecastEvidence();
  const rigs = collectRigsEvidence(NOW);
  const m = SAMPLE_WEEKLY_REPORT_PAYLOAD.modules;
  return {
    ...SAMPLE_WEEKLY_REPORT_PAYLOAD,
    storageWeekEnding: "2026-10-02",
    dataCutoffAt: "2026-10-14T16:28:05.371Z",
    modules: {
      gas_pricing: m.gas_pricing, storage: m.storage, us_gas_supply: m.us_gas_supply, appalachia_supply: m.appalachia_supply,
      lng_demand: m.lng_demand, power_data_center_demand: m.power_data_center_demand, industrial_demand: m.industrial_demand,
      steo_outlook: m.steo_outlook, news: m.news,
      rigs: rigs.items, range_company: range.items, peers: peers.items, valuation: valuation.items, forecast_scenarios: forecast.items,
      deterministic_risk_opportunity: [
        riskItem("us_gas_supply", "U.S. Gas Supply", "MODERATE_RISK", 1),
        riskItem("appalachia_supply", "Appalachia Supply", "WATCH", 2),
        riskItem("storage_levels", "Storage", "WATCH", 3),
        riskItem("industrial_demand", "Industrial Demand", "WATCH", 4),
        riskItem("gas_pricing", "Natural Gas Pricing", "SUPPORTIVE", 5)
      ]
    },
    // Same 15 source rows (labels/periods) a real week carries.
    sourceManifest: {
      generatedFrom: [
        ...SAMPLE_WEEKLY_REPORT_PAYLOAD.sourceManifest.generatedFrom,
        { key: "news_window", label: "Retained/analyzed News articles", period: "(2026-10-02T17:25:01.056Z, 2026-10-14T16:28:05.371Z]", freshness: "current", included: true }
      ].slice(0, 15)
    },
    chartSeries: {
      henryHubDaily: { unit: "$/MMBtu", sourceId: "macro_henry_hub", points: series(60, "2026-07-14", 1.4, (i) => +(2.8 + 0.4 * Math.sin(i / 6) + i * 0.004).toFixed(2)) },
      storageWeekly: { unit: "Bcf", sourceId: "macro_storage", points: series(26, "2026-04-10", 7, (i) => 1960 + i * 60).map((p, i) => ({ ...p, fiveYearAverage: 1888 + i * 63 })) },
      rangeFcfQuarterly: range.chartSeries.rangeFcfQuarterly
    }
  };
}

const RISK_IDS = ["us_gas_supply", "appalachia_supply", "storage_levels", "industrial_demand"].map((d) => `deterministic_risk_opportunity:${d}`);
const HEDGING = "range_company:guidance:RRC:hedging_summary:2H 2026";
const TAKEAWAY = "range_company:guidance:RRC:gas_takeaway:Growth Plan Through 2027";

/**
 * @param {"compliant" | "worst"} kind
 *  compliant -- the prompt's targets (summary 130 words, 3 changes ~250 chars, risk cells
 *               140/120/110, 3 watch items ~60 + reasons ~120, bottom line ~220, 2 investor
 *               questions 100/150/180)
 *  worst     -- the longest fields seen in a real Preview response or the validator ceiling,
 *               whichever is larger (summary 150 words, changes ~500, every risk cell 320 with
 *               2-3 sentences, watch reasons ~370, bottom line 300, questions 160/450/730)
 */
function buildLayoutAssessment(kind) {
  const w = kind === "worst" || kind === "worst-all-announced";
  const riskRow = (id, i, withActions) => ({
    evidenceId: id,
    whyItMatters: prose(w ? 320 : 140, w ? 3 : 2, i),
    ...(withActions ? { announcedAction: prose(w ? 320 : 120, w ? 2 : 1, i + 1), announcedActionEvidenceIds: [i === 0 ? HEDGING : TAKEAWAY] } : {}),
    possibleResponse: prose(w ? 320 : 110, w ? 2 : 1, i + 2)
  });
  return {
    ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT,
    schemaVersion: "1.4.0",
    executiveAssessment: summary(w ? 150 : 130),
    whatChanged: [0, 1, 2].map((i) => ({ title: `Change ${i + 1}: ${prose(48, 1, i).replace(/\.$/, "")}`, assessment: prose(w ? 500 : 250, 2, i), evidenceIds: ["storage:lower48"], impact: ["negative", "mixed", "positive"][i] })),
    // Announced actions on 2 of 4 risks, as in the real Preview run (only some risks have
    // matching Range guidance); kind "worst-all-announced" stresses all four.
    riskTable: RISK_IDS.map((id, i) => riskRow(id, i, kind === "worst-all-announced" || i < 2)),
    managementWatchItems: [0, 1, 2].map((i) => ({ item: prose(w ? 70 : 60, 1, i).replace(/\.$/, ""), reason: prose(w ? 370 : 120, w ? 2 : 1, i), evidenceIds: ["storage:lower48"] })),
    bottomLine: prose(w ? 300 : 220, 2, 3),
    investorQuestions: [0, 1].map((i) => ({ question: `${prose(w ? 160 : 100, 1, i).replace(/\.$/, "")}?`, whyNow: prose(w ? 450 : 150, w ? 3 : 2, i), evidenceIds: ["storage:lower48"], responseFramework: prose(w ? 730 : 180, w ? 4 : 2, i) }))
  };
}

module.exports = { buildLayoutPayload, buildLayoutAssessment, prose, RISK_IDS };
