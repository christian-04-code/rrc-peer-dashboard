import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  collectOriginalFilings,
  fetchCompanySubmissions,
  loadConfiguredCompany,
} from "./discover.mjs";

export const HISTORICAL_START_REPORT_DATE = "2024-01-01";

const FILING_FIELDS = [
  "companyName",
  "ticker",
  "cik",
  "form",
  "reportDate",
  "filingDate",
  "accessionNumber",
  "primaryDocument",
  "filingUrl",
  "repositoryPath",
];

function sameFiling(left, right) {
  return FILING_FIELDS.every((field) => left[field] === right[field]);
}

function sortFilings(filings) {
  return filings.sort((left, right) =>
    left.reportDate.localeCompare(right.reportDate) ||
    left.form.localeCompare(right.form) ||
    left.filingDate.localeCompare(right.filingDate) ||
    left.accessionNumber.localeCompare(right.accessionNumber)
  );
}

export function mergeManifestFilings(existingFilings = [], discoveredFilings = []) {
  const byAccession = new Map();
  for (const filing of existingFilings) {
    const existing = byAccession.get(filing.accessionNumber);
    if (existing && !sameFiling(existing, filing)) {
      throw new Error(`Existing manifest has conflicting accession ${filing.accessionNumber}.`);
    }
    byAccession.set(filing.accessionNumber, filing);
  }
  for (const filing of discoveredFilings) {
    const existing = byAccession.get(filing.accessionNumber);
    if (existing && !sameFiling(existing, filing)) {
      throw new Error(`SEC metadata conflicts with existing accession ${filing.accessionNumber}.`);
    }
    if (!existing) byAccession.set(filing.accessionNumber, filing);
  }
  return sortFilings([...byAccession.values()]);
}

export function buildManifest(company, submissions, existingManifest) {
  const discoveredFilings = collectOriginalFilings(company, submissions, {
    fromReportDate: HISTORICAL_START_REPORT_DATE,
  });
  return {
    schemaVersion: 1,
    company: {
      companyName: company.name,
      ticker: company.ticker,
      cik: company.sec.cik,
    },
    reportDateRange: {
      from: HISTORICAL_START_REPORT_DATE,
    },
    filings: mergeManifestFilings(existingManifest?.filings, discoveredFilings),
  };
}

export function getManifestCompany(manifest, ticker) {
  if (manifest?.companies) return manifest.companies[ticker];
  if (manifest?.company?.ticker === ticker) {
    return {
      ...manifest.company,
      filings: manifest.filings ?? [],
    };
  }
  return undefined;
}

function normalizeCompanies(manifest) {
  if (manifest?.companies) return { ...manifest.companies };
  if (manifest?.company?.ticker) {
    return {
      [manifest.company.ticker]: {
        ...manifest.company,
        filings: manifest.filings ?? [],
      },
    };
  }
  return {};
}

export function updateMultiCompanyManifest(company, submissions, existingManifest) {
  const companies = normalizeCompanies(existingManifest);
  const existingCompany = getManifestCompany(existingManifest, company.ticker);
  const companyManifest = buildManifest(company, submissions, {
    filings: existingCompany?.filings,
  });
  companies[company.ticker] = {
    ...companyManifest.company,
    filings: companyManifest.filings,
  };

  return {
    schemaVersion: 1,
    reportDateRange: {
      from: HISTORICAL_START_REPORT_DATE,
    },
    companies: Object.fromEntries(
      Object.entries(companies).sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeManifest(manifest, root = process.cwd()) {
  const outputPath = path.join(root, "data", "sec", "manifest.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeManifest(manifest), "utf8");
  return outputPath;
}

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  if (!ticker) throw new Error("Usage: npm run sec:manifest -- <TICKER>");
  const company = await loadConfiguredCompany(ticker);
  const submissions = await fetchCompanySubmissions(company, {
    userAgent: process.env.SEC_USER_AGENT,
  });
  let existingManifest;
  try {
    existingManifest = JSON.parse(await readFile(path.join(process.cwd(), "data", "sec", "manifest.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const manifest = updateMultiCompanyManifest(company, submissions, existingManifest);
  const outputPath = await writeManifest(manifest);
  process.stdout.write(`${outputPath}\n${serializeManifest(manifest)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
