import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SUBMISSIONS_ORIGIN = "https://data.sec.gov";
const REQUIRED_FORMS = ["10-K", "10-Q"];
const OUTPUT_FIELDS = [
  "companyName",
  "ticker",
  "cik",
  "form",
  "reportDate",
  "filingDate",
  "accessionNumber",
  "primaryDocument",
];

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  return value;
}

export function validateCompanySecConfig(company, ticker) {
  if (!company) throw new Error(`Company ${ticker} is not defined in config/companies.json.`);
  if (company.ticker !== ticker) {
    throw new Error(`Configured ticker ${company.ticker ?? "(missing)"} does not match ${ticker}.`);
  }

  const cik = requireText(company.sec?.cik, `SEC CIK for ${ticker}`);
  if (!/^\d{10}$/.test(cik)) {
    throw new Error(`SEC CIK for ${ticker} must be a zero-padded 10-character string.`);
  }
  requireText(company.name, `Company name for ${ticker}`);
  return company;
}

export async function loadConfiguredCompany(ticker, root = process.cwd()) {
  const configPath = path.join(root, "config", "companies.json");
  const registry = JSON.parse(await readFile(configPath, "utf8"));
  return validateCompanySecConfig(registry.companies?.[ticker], ticker);
}

function normalizedCompanyName(value) {
  return value
    .toUpperCase()
    .replace(/\bCORPORATION\b/g, "CORP")
    .replace(/[^A-Z0-9]/g, "");
}

export function verifySubmissionIdentity(company, submissions) {
  const returnedCik = String(submissions?.cik ?? "").padStart(10, "0");
  if (returnedCik !== company.sec.cik) {
    throw new Error(`SEC response CIK ${returnedCik} does not match configured CIK ${company.sec.cik}.`);
  }

  const tickers = Array.isArray(submissions?.tickers) ? submissions.tickers : [];
  if (!tickers.includes(company.ticker)) {
    throw new Error(`SEC response does not associate CIK ${company.sec.cik} with ticker ${company.ticker}.`);
  }

  const secName = requireText(submissions?.name, "SEC response company name");
  if (normalizedCompanyName(secName) !== normalizedCompanyName(company.name)) {
    throw new Error(`SEC response company name ${secName} does not match configured company ${company.name}.`);
  }
}

function recentRecord(recent, index, company, form) {
  const record = {
    companyName: company.name,
    ticker: company.ticker,
    cik: company.sec.cik,
    form,
    reportDate: requireText(recent.reportDate?.[index], `reportDate for ${form} filing`),
    filingDate: requireText(recent.filingDate?.[index], `filingDate for ${form} filing`),
    accessionNumber: requireText(recent.accessionNumber?.[index], `accessionNumber for ${form} filing`),
    primaryDocument: requireText(recent.primaryDocument?.[index], `primaryDocument for ${form} filing`),
  };
  return Object.fromEntries(OUTPUT_FIELDS.map((field) => [field, record[field]]));
}

export function selectMostRecentOriginalFilings(company, submissions) {
  verifySubmissionIdentity(company, submissions);
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) {
    throw new Error("SEC response is missing filings.recent form metadata.");
  }

  return REQUIRED_FORMS.map((form) => {
    const candidates = recent.form
      .map((candidateForm, index) => ({ candidateForm, index }))
      .filter(({ candidateForm }) => candidateForm === form)
      .map(({ index }) => recentRecord(recent, index, company, form))
      .sort((left, right) =>
        right.filingDate.localeCompare(left.filingDate) ||
        right.accessionNumber.localeCompare(left.accessionNumber)
      );

    if (candidates.length === 0) {
      throw new Error(`SEC response contains no original Form ${form} filing.`);
    }
    return candidates[0];
  });
}

export async function discoverCompanyFilings(company, { fetchImpl = fetch, userAgent } = {}) {
  validateCompanySecConfig(company, company?.ticker ?? "requested company");
  const declaredUserAgent = requireText(userAgent, "SEC_USER_AGENT");
  const url = `${SUBMISSIONS_ORIGIN}/submissions/CIK${company.sec.cik}.json`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": declaredUserAgent,
    },
  });

  if (!response.ok) {
    throw new Error(`SEC submissions request failed: ${response.status} ${response.statusText}.`);
  }

  let submissions;
  try {
    submissions = await response.json();
  } catch (cause) {
    throw new Error(`SEC submissions response was not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return selectMostRecentOriginalFilings(company, submissions);
}

async function main() {
  const ticker = process.argv[2]?.toUpperCase();
  if (!ticker) throw new Error("Usage: npm run sec:discover -- RRC");
  const company = await loadConfiguredCompany(ticker);
  const records = await discoverCompanyFilings(company, { userAgent: process.env.SEC_USER_AGENT });
  process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
