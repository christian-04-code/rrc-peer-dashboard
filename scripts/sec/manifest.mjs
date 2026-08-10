import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  collectOriginalFilings,
  fetchCompanySubmissions,
  loadConfiguredCompany,
} from "./discover.mjs";

export const REPORT_DATE_RANGE = Object.freeze({
  from: "2024-01-01",
  through: "2026-06-30",
});

export function buildManifest(company, submissions) {
  return {
    schemaVersion: 1,
    company: {
      companyName: company.name,
      ticker: company.ticker,
      cik: company.sec.cik,
    },
    reportDateRange: REPORT_DATE_RANGE,
    filings: collectOriginalFilings(company, submissions, {
      fromReportDate: REPORT_DATE_RANGE.from,
      throughReportDate: REPORT_DATE_RANGE.through,
    }),
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
  if (!ticker) throw new Error("Usage: npm run sec:manifest -- RRC");
  const company = await loadConfiguredCompany(ticker);
  const submissions = await fetchCompanySubmissions(company, {
    userAgent: process.env.SEC_USER_AGENT,
  });
  const manifest = buildManifest(company, submissions);
  const outputPath = await writeManifest(manifest);
  process.stdout.write(`${outputPath}\n${serializeManifest(manifest)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
