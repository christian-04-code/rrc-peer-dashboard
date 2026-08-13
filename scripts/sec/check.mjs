import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadConfiguredSecTickers } from "./discover.mjs";
import { loadManifest } from "./retrieve.mjs";
import { getManifestCompany } from "./manifest.mjs";
import { loadTsModule } from "./ts-runtime.mjs";

/**
 * `npm run sec:check` -- quick status command. For each configured ticker,
 * compares the newest filing already in data/sec/manifest.json against the
 * newest quarter already recorded in lib/dashboard/financials-quarterly.ts,
 * and reports whether a quarterly update is available. Read-only: does not
 * hit the network (run sec:sync first to refresh the manifest) and never
 * writes anything.
 */

function quarterKeyFromReportDate(reportDate) {
  const [year, month] = reportDate.split("-");
  const quarter = { "03": 1, "06": 2, "09": 3, "12": 4 }[month];
  if (!quarter) return null;
  return `Q${quarter} ${year}`;
}

export function checkTicker(ticker, manifest, financialsModule) {
  const company = getManifestCompany(manifest, ticker);
  const filings = (company?.filings ?? []).slice().sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  const latestFiling = filings[0];
  const knownQuarters = new Set(financialsModule.getAllQuartersForTicker(ticker).map((q) => q.quarter));

  if (!latestFiling) return { ticker, status: "no-manifest-data", detail: `No filings in manifest for ${ticker}. Run "npm run sec:sync -- ${ticker}".` };

  const latestQuarterKey = quarterKeyFromReportDate(latestFiling.reportDate);
  const upToDate = !latestQuarterKey || knownQuarters.has(latestQuarterKey);

  return {
    ticker,
    status: upToDate ? "up-to-date" : "update-available",
    latestFiling: { form: latestFiling.form, reportDate: latestFiling.reportDate, accessionNumber: latestFiling.accessionNumber },
    latestQuarterKey,
    detail: upToDate
      ? `Canonical data already includes ${latestQuarterKey ?? latestFiling.reportDate}.`
      : `New ${latestFiling.form} for ${latestQuarterKey} (filed ${latestFiling.filingDate}) is not yet in financials-quarterly.ts. Run: npm run sec:update -- --ticker ${ticker} --year ${latestQuarterKey.split(" ")[1]} --quarter ${latestQuarterKey.split(" ")[0]} --dry-run`,
  };
}

async function main() {
  const root = process.cwd();
  const tickers = await loadConfiguredSecTickers(root);
  const manifest = await loadManifest(root);
  const financialsModule = loadTsModule("lib/dashboard/financials-quarterly.ts", root);

  const results = tickers.map((ticker) => checkTicker(ticker, manifest, financialsModule));
  for (const result of results) {
    process.stdout.write(`${result.ticker}: ${result.status} -- ${result.detail}\n`);
  }
  const updatesAvailable = results.filter((result) => result.status === "update-available");
  process.stdout.write(`\n${updatesAvailable.length} of ${results.length} tickers have an update available.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
