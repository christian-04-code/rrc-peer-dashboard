import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  buildFilingRepositoryPath,
  buildSecFilingUrl,
  loadConfiguredCompany,
} from "./discover.mjs";
import { getManifestCompany } from "./manifest.mjs";

const ORIGINAL_FORMS = new Set(["10-Q", "10-K"]);

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  return value;
}

export async function loadManifest(root = process.cwd()) {
  const manifestPath = path.join(root, "data", "sec", "manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export function validateManifestFilings(company, manifest) {
  const manifestCompany = getManifestCompany(manifest, company.ticker);
  if (manifestCompany?.ticker !== company.ticker || manifestCompany?.cik !== company.sec.cik) {
    throw new Error(`SEC manifest company identity does not match configured ${company.ticker} identity.`);
  }
  if (!Array.isArray(manifestCompany.filings)) throw new Error("SEC manifest filings array is required.");

  const uniqueFilings = new Map();
  for (const filing of manifestCompany.filings) {
    const accessionNumber = requireText(filing?.accessionNumber, "manifest accessionNumber");
    if (
      filing.companyName !== company.name ||
      filing.ticker !== company.ticker ||
      filing.cik !== company.sec.cik
    ) {
      throw new Error(`Manifest filing ${accessionNumber} does not belong to configured ${company.ticker}.`);
    }
    if (!ORIGINAL_FORMS.has(filing.form)) {
      throw new Error(`Manifest filing ${accessionNumber} must use exact form 10-Q or 10-K.`);
    }

    const expectedPath = buildFilingRepositoryPath(filing);
    if (filing.repositoryPath !== expectedPath) {
      throw new Error(`Manifest filing ${accessionNumber} repositoryPath must be ${expectedPath}.`);
    }
    const expectedUrl = buildSecFilingUrl(filing.cik, accessionNumber, filing.primaryDocument);
    if (filing.filingUrl !== expectedUrl) {
      throw new Error(`Manifest filing ${accessionNumber} filingUrl does not match SEC archive metadata.`);
    }

    const existing = uniqueFilings.get(accessionNumber);
    if (existing) {
      if (
        existing.reportDate !== filing.reportDate ||
        existing.form !== filing.form ||
        existing.repositoryPath !== filing.repositoryPath
      ) {
        throw new Error(`Duplicate accessionNumber ${accessionNumber} has conflicting metadata.`);
      }
      continue;
    }
    uniqueFilings.set(accessionNumber, filing);
  }
  return [...uniqueFilings.values()];
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retrieveManifestFilings(
  company,
  manifest,
  { root = process.cwd(), fetchImpl = fetch, userAgent, delayMs = 150 } = {}
) {
  const declaredUserAgent = requireText(userAgent, "SEC_USER_AGENT");
  const filings = validateManifestFilings(company, manifest);
  const results = [];

  for (const filing of filings) {
    const destination = path.join(root, ...filing.repositoryPath.split("/"));
    if (await fileExists(destination)) {
      results.push({
        accessionNumber: filing.accessionNumber,
        repositoryPath: filing.repositoryPath,
        status: "skipped/existing",
      });
      continue;
    }

    const response = await fetchImpl(filing.filingUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": declaredUserAgent,
      },
    });
    if (response.status !== 200) {
      throw new Error(
        `SEC filing request failed for ${filing.accessionNumber}: ${response.status} ${response.statusText}.`
      );
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength === 0) {
      throw new Error(`SEC filing response was empty for ${filing.accessionNumber}.`);
    }

    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await writeFile(destination, body, { flag: "wx" });
      results.push({
        accessionNumber: filing.accessionNumber,
        repositoryPath: filing.repositoryPath,
        status: "downloaded",
        bytes: body.byteLength,
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      results.push({
        accessionNumber: filing.accessionNumber,
        repositoryPath: filing.repositoryPath,
        status: "skipped/existing",
      });
    }

    if (delayMs > 0) await wait(delayMs);
  }

  return {
    companyName: company.name,
    ticker: company.ticker,
    cik: company.sec.cik,
    total: filings.length,
    downloaded: results.filter((result) => result.status === "downloaded").length,
    skipped: results.filter((result) => result.status === "skipped/existing").length,
    files: results,
  };
}

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  if (!ticker) throw new Error("Usage: npm run sec:retrieve -- <TICKER>");
  const company = await loadConfiguredCompany(ticker);
  const manifest = await loadManifest();
  const result = await retrieveManifestFilings(company, manifest, {
    userAgent: process.env.SEC_USER_AGENT,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
