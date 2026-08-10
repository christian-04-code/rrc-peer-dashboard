import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fetchCompanySubmissions, loadConfiguredCompany } from "./discover.mjs";
import { buildManifest, serializeManifest, writeManifest } from "./manifest.mjs";
import { retrieveManifestFilings, validateManifestFilings } from "./retrieve.mjs";

export async function syncRrc({
  root = process.cwd(),
  userAgent,
  submissionsFetchImpl = fetch,
  filingFetchImpl = fetch,
  delayMs = 150,
} = {}) {
  const company = await loadConfiguredCompany("RRC", root);
  const manifestPath = path.join(root, "data", "sec", "manifest.json");
  const existingText = await readFile(manifestPath, "utf8");
  const existingManifest = JSON.parse(existingText);
  const existingFilings = validateManifestFilings(company, existingManifest);
  const knownAccessions = new Set(existingFilings.map((filing) => filing.accessionNumber));

  const submissions = await fetchCompanySubmissions(company, {
    fetchImpl: submissionsFetchImpl,
    userAgent,
  });
  const manifest = buildManifest(company, submissions, existingManifest);
  const newFilings = manifest.filings.filter(
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
  if (ticker !== "RRC") throw new Error("Usage: npm run sec:sync -- RRC");
  const result = await syncRrc({ userAgent: process.env.SEC_USER_AGENT });
  process.stdout.write(`${formatSyncSummary(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
