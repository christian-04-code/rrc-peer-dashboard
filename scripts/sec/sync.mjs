import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  fetchCompanySubmissions,
  loadConfiguredCompany,
  loadConfiguredSecTickers,
} from "./discover.mjs";
import {
  getManifestCompany,
  serializeManifest,
  updateMultiCompanyManifest,
  writeManifest,
} from "./manifest.mjs";
import { retrieveManifestFilings, validateManifestFilings } from "./retrieve.mjs";

export async function syncCompany(ticker, {
  root = process.cwd(),
  userAgent,
  submissionsFetchImpl = fetch,
  filingFetchImpl = fetch,
  delayMs = 150,
} = {}) {
  const company = await loadConfiguredCompany(ticker, root);
  const manifestPath = path.join(root, "data", "sec", "manifest.json");
  const existingText = await readFile(manifestPath, "utf8");
  const existingManifest = JSON.parse(existingText);
  const existingCompany = getManifestCompany(existingManifest, ticker);
  const existingFilings = existingCompany
    ? validateManifestFilings(company, existingManifest)
    : [];
  const knownAccessions = new Set(existingFilings.map((filing) => filing.accessionNumber));

  const submissions = await fetchCompanySubmissions(company, {
    fetchImpl: submissionsFetchImpl,
    userAgent,
  });
  const manifest = updateMultiCompanyManifest(company, submissions, existingManifest);
  const companyManifest = getManifestCompany(manifest, ticker);
  const newFilings = companyManifest.filings.filter(
    (filing) => !knownAccessions.has(filing.accessionNumber)
  );
  const manifestText = serializeManifest(manifest);
  const manifestUpdated = manifestText !== existingText;
  if (manifestUpdated) await writeManifest(manifest, root);

  const retrieval = await retrieveManifestFilings(company, manifest, {
    root,
    fetchImpl: filingFetchImpl,
    userAgent,
    delayMs,
  });

  return {
    ticker: company.ticker,
    knownFilings: existingFilings.length,
    newFilingsDiscovered: newFilings.length,
    downloaded: retrieval.downloaded,
    existingSkipped: retrieval.skipped,
    failures: 0,
    manifestUpdated,
  };
}

export function syncRrc(options = {}) {
  return syncCompany("RRC", options);
}

export async function syncAll(options = {}) {
  const tickers = await loadConfiguredSecTickers(options.root ?? process.cwd());
  const results = [];
  for (const ticker of tickers) results.push(await syncCompany(ticker, options));
  return results;
}

export function formatSyncSummary(result) {
  return [
    `${result.ticker} SEC sync`,
    `Known filings: ${result.knownFilings}`,
    `New filings discovered: ${result.newFilingsDiscovered}`,
    `Downloaded: ${result.downloaded}`,
    `Existing/skipped: ${result.existingSkipped}`,
    `Failures: ${result.failures}`,
  ].join("\n");
}

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  if (!ticker) throw new Error("Usage: npm run sec:sync -- <TICKER|all>");
  const options = { userAgent: process.env.SEC_USER_AGENT };
  const results = ticker === "ALL"
    ? await syncAll(options)
    : [await syncCompany(ticker, options)];
  process.stdout.write(`${results.map(formatSyncSummary).join("\n\n")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
