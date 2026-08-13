import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadConfiguredCompany } from "./discover.mjs";
import { fetchCompanyFacts } from "../../lib/sec-pipeline/xbrl.mjs";

/**
 * Extends the SEC filing sync (discover/manifest/retrieve/sync.mjs) with the
 * one additional SEC source the update pipeline needs: XBRL "company facts"
 * (data.sec.gov/api/xbrl/companyfacts/CIK##########.json), the only source
 * this pipeline treats as deterministic (see lib/sec-pipeline/xbrl.mjs).
 * Cached locally the same way filings already are, so a dry-run/apply never
 * needs live network access once synced.
 */
export function companyFactsPath(ticker, root = process.cwd()) {
  return path.join(root, "data", "sec", ticker, "companyfacts.json");
}

export async function loadCachedCompanyFacts(ticker, root = process.cwd()) {
  const filePath = companyFactsPath(ticker, root);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function syncCompanyFacts(company, { root = process.cwd(), fetchImpl = fetch, userAgent } = {}) {
  const facts = await fetchCompanyFacts(company.sec.cik, { fetchImpl, userAgent });
  const destination = companyFactsPath(company.ticker, root);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(facts, null, 2)}\n`, "utf8");
  return destination;
}

/** Returns cached company facts, fetching and caching them first if absent. */
export async function ensureCompanyFacts(ticker, { root = process.cwd(), fetchImpl = fetch, userAgent } = {}) {
  const cached = await loadCachedCompanyFacts(ticker, root);
  if (cached) return cached;
  const company = await loadConfiguredCompany(ticker, root);
  await syncCompanyFacts(company, { root, fetchImpl, userAgent });
  return loadCachedCompanyFacts(ticker, root);
}

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  if (!ticker) throw new Error("Usage: npm run sec:xbrl -- <TICKER>");
  const company = await loadConfiguredCompany(ticker);
  const destination = await syncCompanyFacts(company, { userAgent: process.env.SEC_USER_AGENT });
  process.stdout.write(`Cached SEC company facts for ${ticker} at ${destination}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
