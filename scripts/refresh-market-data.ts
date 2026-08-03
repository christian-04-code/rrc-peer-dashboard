/**
 * Standalone refresh script — NOT part of the Next.js build (next.config.ts uses
 * output: "export", so there is no server at runtime to call these APIs live).
 * Run manually or via cron:
 *   npm run refresh-market-data
 *
 * Fetches:
 *  - EIA Henry Hub daily spot price (series RNGWHHD) -> henry_hub_daily_spot_price_usd_per_mmbtu
 *  - EIA weekly working gas storage (route stor/wkly, NOT stor/sum which is monthly-oriented)
 *    -> eia_weekly_working_gas_storage_bcf
 *  - Finnhub live equity quotes for the 7 core peers -> finnhub_peer_equity_quotes (new field;
 *    not consumed anywhere yet, but price x Shares Outstanding could feed the EV/EBITDAX gap
 *    identified separately)
 *
 * On any individual fetch failure, the prior value for that specific field/date is kept and the
 * failure is logged — never overwritten with null/empty.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env"));

const EIA_API_KEY = process.env.EIA_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

if (!EIA_API_KEY || !FINNHUB_API_KEY) {
  console.error("Missing EIA_API_KEY or FINNHUB_API_KEY in .env — aborting.");
  process.exit(1);
}

const DATA_PATH = path.join(process.cwd(), "data", "market-data.json");
const CORE_PEER_TICKERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"] as const;

// EIA v2 duoarea/process codes -> existing market-data.json column names.
// Confirmed live against the API (2026-08-03): stor/wkly is the correct weekly route;
// stor/sum does not carry these region series.
const STORAGE_SERIES: { duoarea: string; process: string; field: string }[] = [
  { duoarea: "R48", process: "SWO", field: "Lower 48 (Bcf)" },
  { duoarea: "R31", process: "SWO", field: "East (Bcf)" },
  { duoarea: "R32", process: "SWO", field: "Midwest (Bcf)" },
  { duoarea: "R34", process: "SWO", field: "Mountain (Bcf)" },
  { duoarea: "R35", process: "SWO", field: "Pacific (Bcf)" },
  { duoarea: "R33", process: "SWO", field: "South Central (Bcf)" },
  { duoarea: "R33", process: "SSO", field: "SC Salt (Bcf)" },
  { duoarea: "R33", process: "SNO", field: "SC NonSalt (Bcf)" },
];

interface MarketData {
  meta: Record<string, unknown>;
  henry_hub_daily_spot_price_usd_per_mmbtu: Record<string, number>;
  eia_weekly_working_gas_storage_bcf: Record<string, unknown>[];
  eia_weekly_propane_stocks: Record<string, unknown>[];
  eia_monthly_natural_gas_pricing: Record<string, unknown>[];
  us_electric_demand_pct_change_vs_prior_week: Record<string, unknown>[];
  finnhub_peer_equity_quotes?: Record<string, unknown>;
  last_refreshed?: string;
  [key: string]: unknown;
}

interface EiaSeriesRow {
  period: string;
  value: string | number;
}

interface EiaResponse {
  response?: { data?: EiaSeriesRow[] };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchHenryHub(): Promise<{ date: string; value: number }[]> {
  const url =
    `https://api.eia.gov/v2/natural-gas/pri/fut/data/?api_key=${EIA_API_KEY}` +
    `&frequency=daily&data[0]=value&facets[series][]=RNGWHHD` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=60`;
  const json = await fetchJson<EiaResponse>(url);
  const rows = json.response?.data ?? [];
  return rows
    .map((r) => ({ date: r.period, value: Number(r.value) }))
    .filter((r) => r.date && !Number.isNaN(r.value));
}

async function fetchWeeklyStorage(): Promise<Map<string, Record<string, number>>> {
  const byDate = new Map<string, Record<string, number>>();
  for (const series of STORAGE_SERIES) {
    const url =
      `https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key=${EIA_API_KEY}` +
      `&frequency=weekly&data[0]=value&facets[duoarea][]=${series.duoarea}` +
      `&facets[process][]=${series.process}` +
      `&sort[0][column]=period&sort[0][direction]=desc&length=12`;
    try {
      const json = await fetchJson<EiaResponse>(url);
      const rows = json.response?.data ?? [];
      for (const r of rows) {
        const date = r.period;
        const value = Number(r.value);
        if (!date || Number.isNaN(value)) continue;
        const entry = byDate.get(date) ?? {};
        entry[series.field] = value;
        byDate.set(date, entry);
      }
    } catch (err) {
      console.error(
        `[EIA storage] failed for ${series.field} (${series.duoarea}/${series.process}), keeping existing data for this series:`,
        (err as Error).message,
      );
    }
  }
  return byDate;
}

interface FinnhubQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

async function fetchFinnhubQuote(ticker: string): Promise<Record<string, unknown> | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  try {
    const json = await fetchJson<FinnhubQuote>(url);
    if (typeof json.c !== "number" || json.c === 0) {
      throw new Error(`no valid quote returned (c=${json.c})`);
    }
    return {
      current_price: json.c,
      change: json.d,
      percent_change: json.dp,
      high: json.h,
      low: json.l,
      open: json.o,
      previous_close: json.pc,
      quote_timestamp: new Date(json.t * 1000).toISOString(),
    };
  } catch (err) {
    console.error(`[Finnhub] failed for ${ticker}, keeping prior value:`, (err as Error).message);
    return null;
  }
}

async function main() {
  console.log(`Reading ${DATA_PATH}...`);
  const data: MarketData = JSON.parse(readFileSync(DATA_PATH, "utf-8"));

  console.log("Fetching Henry Hub daily spot price from EIA...");
  try {
    const rows = await fetchHenryHub();
    let changed = 0;
    for (const { date, value } of rows) {
      if (data.henry_hub_daily_spot_price_usd_per_mmbtu[date] !== value) {
        data.henry_hub_daily_spot_price_usd_per_mmbtu[date] = value;
        changed++;
      }
    }
    data.henry_hub_daily_spot_price_usd_per_mmbtu = Object.fromEntries(
      Object.entries(data.henry_hub_daily_spot_price_usd_per_mmbtu).sort(([a], [b]) => a.localeCompare(b)),
    );
    console.log(`  -> ${rows.length} rows fetched, ${changed} new/changed values merged.`);
  } catch (err) {
    console.error("  -> Henry Hub fetch failed entirely, keeping existing data untouched:", (err as Error).message);
  }

  console.log("Fetching weekly working gas storage from EIA...");
  const storageByDate = await fetchWeeklyStorage();
  if (storageByDate.size === 0) {
    console.error("  -> No storage data fetched for any series, keeping existing data untouched.");
  } else {
    // Append-only: never modify or de-duplicate existing rows. The existing array has known
    // pre-existing duplicate-date rows with conflicting values (a data-quality issue predating
    // this script) — silently resolving those would be a judgment call this script has no
    // business making. Only dates with zero existing rows get a new row added.
    const existingDates = new Set(data.eia_weekly_working_gas_storage_bcf.map((row) => row.date as string));
    let appended = 0;
    for (const [date, fields] of storageByDate) {
      if (existingDates.has(date)) continue;
      data.eia_weekly_working_gas_storage_bcf.push({ date, ...fields });
      appended++;
    }
    // Only re-sort if something was actually appended — avoids reordering (and diff-noising)
    // the existing array on a no-op run.
    if (appended > 0) {
      data.eia_weekly_working_gas_storage_bcf.sort((a, b) => (a.date as string).localeCompare(b.date as string));
    }
    console.log(
      `  -> ${storageByDate.size} weekly date(s) fetched from API, ${appended} brand-new date(s) appended (existing rows never modified).`,
    );
  }

  console.log("Fetching Finnhub live equity quotes for core peers...");
  const quotes: Record<string, unknown> = { ...(data.finnhub_peer_equity_quotes ?? {}) };
  for (const ticker of CORE_PEER_TICKERS) {
    const quote = await fetchFinnhubQuote(ticker);
    if (quote) {
      quotes[ticker] = quote;
      console.log(`  -> ${ticker}: $${(quote as { current_price: number }).current_price}`);
    } else {
      console.error(`  -> ${ticker}: ${quotes[ticker] ? "existing quote retained" : "no prior quote on file either"}.`);
    }
  }
  data.finnhub_peer_equity_quotes = quotes;

  data.last_refreshed = new Date().toISOString();

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`\nWrote ${DATA_PATH}. last_refreshed = ${data.last_refreshed}`);
}

main().catch((err) => {
  console.error("Fatal error in refresh-market-data:", err);
  process.exit(1);
});
