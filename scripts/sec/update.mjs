import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadConfiguredCompany } from "./discover.mjs";
import { loadManifest } from "./retrieve.mjs";
import { getManifestCompany } from "./manifest.mjs";
import { ensureCompanyFacts } from "./xbrl-fetch.mjs";
import { loadTsModule } from "./ts-runtime.mjs";
import { createCandidateSkeleton, makeGuidanceCandidate } from "../../lib/sec-pipeline/candidate-schema.mjs";
import { extractFinancialField } from "../../lib/sec-pipeline/xbrl.mjs";
import { applyManualWorksheet } from "../../lib/sec-pipeline/manual-input.mjs";
import { deriveNetDebt } from "../../lib/sec-pipeline/derive.mjs";
import { classifyCandidate } from "../../lib/sec-pipeline/classify.mjs";
import { runAllGuardrails, flagLargeQoQChanges } from "../../lib/sec-pipeline/guardrails.mjs";
import { buildFullReport } from "../../lib/sec-pipeline/report.mjs";
import { evaluateMarketDataBoundary } from "../../lib/sec-pipeline/market-boundary.mjs";
import { checkDetailedActualEligibility } from "../../lib/sec-pipeline/forecast-safety.mjs";
import { CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH, CANDIDATE_TO_HISTORICAL_METRIC } from "../../lib/sec-pipeline/canonical-field-map.mjs";
import { applyHistoricalUpdate, serializeHistoricalFile } from "../../lib/sec-pipeline/historical-writer.mjs";
import { insertQuarterIntoFinancialsQuarterly } from "../../lib/sec-pipeline/financials-writer.mjs";
import { applyGuidanceUpdate, serializeGuidanceFile } from "../../lib/sec-pipeline/guidance-writer.mjs";

// Fields whose raw XBRL tag cannot be trusted to match this repo's canonical
// definition without a human comparing it to the earnings release (D&C-only
// vs. total capex, carrying-value vs. face-value debt -- see PHASE 3). Always
// routed through manual-input.mjs instead of being auto-applied.
const AMBIGUOUS_XBRL_FIELDS = new Set(["capitalExpenditures", "totalDebtFaceValue"]);

export function previousQuarterKey(fiscalYear, fiscalQuarter) {
  return fiscalQuarter === 1 ? `Q4 ${fiscalYear - 1}` : `Q${fiscalQuarter - 1} ${fiscalYear}`;
}

export function fiscalQuarterDates(fiscalYear, fiscalQuarter) {
  const starts = { 1: [1, 1], 2: [4, 1], 3: [7, 1], 4: [10, 1] };
  const ends = { 1: [3, 31], 2: [6, 30], 3: [9, 30], 4: [12, 31] };
  const pad = (n) => String(n).padStart(2, "0");
  const [startMonth, startDay] = starts[fiscalQuarter];
  const [endMonth, endDay] = ends[fiscalQuarter];
  return {
    periodStart: `${fiscalYear}-${pad(startMonth)}-${pad(startDay)}`,
    periodEnd: `${fiscalYear}-${pad(endMonth)}-${pad(endDay)}`,
  };
}

function extractWithPolicy(companyFacts, fieldName, periodArgs) {
  const field = extractFinancialField(companyFacts, fieldName, periodArgs);
  if (field.value !== null && AMBIGUOUS_XBRL_FIELDS.has(fieldName)) {
    return {
      ...field,
      classification: "C",
      confidence: "medium",
      notes: `${field.notes} Downgraded to REVIEW_REQUIRED: this repo's canonical convention for ${fieldName} is company-specific and cannot be safely inferred from the raw XBRL tag alone -- confirm against the earnings release / debt footnote and supply via --manual-input if it differs.`,
    };
  }
  return field;
}

/**
 * Finds the manifest filing whose reportDate matches the requested fiscal
 * quarter's period end exactly, refusing ambiguity if more than one form
 * matches (comparative-column / wrong-filing protection at the filing level).
 */
export function findFilingForQuarter(manifest, ticker, periodEnd) {
  const company = getManifestCompany(manifest, ticker);
  if (!company) throw new Error(`No manifest entry for ${ticker}. Run "npm run sec:sync -- ${ticker}" first.`);
  const matches = (company.filings ?? []).filter((filing) => filing.reportDate === periodEnd);
  if (matches.length === 0) {
    throw new Error(`No filing with reportDate ${periodEnd} found for ${ticker} in data/sec/manifest.json. Run "npm run sec:sync -- ${ticker}" to fetch the latest filings.`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous: ${matches.length} filings share reportDate ${periodEnd} for ${ticker} (${matches.map((f) => f.accessionNumber).join(", ")}).`);
  }
  return matches[0];
}

function getCurrentFinancialsQuarterlyValue(financialsModule, ticker, quarterKey, path_) {
  let quarter;
  try {
    quarter = financialsModule.getQuarterlyFinancials?.(ticker, quarterKey);
  } catch {
    return undefined; // quarter not present yet -- getQuarterlyFinancials throws rather than returning undefined
  }
  if (!quarter) return undefined;
  let node = quarter;
  for (const key of path_) {
    if (node == null) return undefined;
    node = node[key];
  }
  return node && typeof node === "object" && "value" in node ? node.value : undefined;
}

/**
 * Builds and classifies a full candidate for ticker/fiscalYear/fiscalQuarter.
 * Pure orchestration function (no filesystem writes) so it is directly
 * testable and reusable by the replay simulation in PHASE 9.
 */
export async function buildCandidate({
  ticker,
  fiscalYear,
  fiscalQuarter,
  root = process.cwd(),
  manifest,
  companyFacts,
  manualWorksheet,
  financialsModule,
  historicalFile,
  getMarketCapForQuarter,
  materialChangeThreshold,
  allowReplay = false,
}) {
  const company = await loadConfiguredCompany(ticker, root);
  const { periodStart, periodEnd } = fiscalQuarterDates(fiscalYear, fiscalQuarter);
  const filingType = fiscalQuarter === 4 ? "10-K" : "10-Q";
  const filing = findFilingForQuarter(manifest, ticker, periodEnd);
  if (filing.form !== filingType) {
    throw new Error(`Expected a ${filingType} for ${ticker} ${periodEnd} but manifest has a ${filing.form}.`);
  }

  const identity = {
    ticker,
    fiscalYear,
    fiscalQuarter,
    filingType,
    filingDate: filing.filingDate,
    accessionNumber: filing.accessionNumber,
    sourcePath: filing.repositoryPath,
  };

  let candidate = createCandidateSkeleton(identity);
  candidate.meta = { ...candidate.meta, replay: allowReplay, generatedAt: null };

  const expectQuarterDuration = fiscalQuarter !== 4; // Q4 uses the 10-K's full-year window; standalone Q4 needs deriveStandaloneQ4FromFullYear (left to a follow-up worksheet pass, see runbook)
  const periodArgs = { periodStart, periodEnd, accessionNumber: filing.accessionNumber, filingUrl: filing.filingUrl, expectQuarterDuration };

  candidate.financial.revenue = extractWithPolicy(companyFacts, "revenue", periodArgs);
  candidate.financial.dilutedShares = extractWithPolicy(companyFacts, "dilutedShares", { ...periodArgs, unit: "MM" });
  candidate.financial.capitalExpenditures = extractWithPolicy(companyFacts, "capitalExpenditures", periodArgs);

  const totalDebtField = extractWithPolicy(companyFacts, "totalDebtFaceValue", periodArgs);
  const cashField = extractWithPolicy(companyFacts, "cashAndEquivalents", periodArgs);
  candidate.financial.netDebt = deriveNetDebt(totalDebtField, cashField);
  // adjustedEbitdax has no us-gaap concept (non-GAAP); stays blank until a manual worksheet supplies it.

  if (manualWorksheet) candidate = applyManualWorksheet(candidate, manualWorksheet);
  if (manualWorksheet?.guidance) {
    candidate = { ...candidate, guidance: manualWorksheet.guidance.map((entry) => makeGuidanceCandidate(entry)) };
  }

  // Some fields (e.g. dilutedShares) are only tracked in historical.json, not
  // financials-quarterly.ts -- found by the PHASE 9 AR replay, where the raw
  // XBRL diluted-share fact (310.643mm) legitimately differs from the
  // already-canonical, human-transcribed EPS-note figure (313.184mm) for the
  // same filing. Without this fallback, classify.mjs would never see the
  // existing value to compare against.
  const getCurrentValue = (group, fieldName) => {
    const candidatePath = `${group}.${fieldName}`;
    const fqPath = CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH[candidatePath];
    if (fqPath && financialsModule) {
      const value = getCurrentFinancialsQuarterlyValue(financialsModule, ticker, candidate.identity.quarterKey, fqPath);
      if (value !== undefined) return value;
    }
    const historicalMetric = CANDIDATE_TO_HISTORICAL_METRIC[candidatePath];
    if (historicalMetric && historicalFile) {
      const value = historicalFile.companies?.[ticker]?.metrics?.[historicalMetric]?.values?.[candidate.identity.quarterKey];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  };

  const { candidate: classified, summary } = classifyCandidate(candidate, getCurrentValue, { materialChangeThreshold });

  // Genuine QoQ guardrail: a derived (classification-B) field that moved a
  // lot versus the PRIOR quarter (not this same quarter's own history) is
  // downgraded from AUTO_APPLY to REVIEW_REQUIRED -- classification-A fields
  // are exempt since they are already a deterministic exact-period XBRL
  // match, per PHASE 8's "large changes should not auto-fail if source-backed".
  const priorQuarterKey = previousQuarterKey(fiscalYear, fiscalQuarter);
  const getPriorQuarterValue = (group, fieldName) => {
    const fqPath = CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH[`${group}.${fieldName}`];
    if (!fqPath || !financialsModule) return undefined;
    return getCurrentFinancialsQuarterlyValue(financialsModule, ticker, priorQuarterKey, fqPath);
  };
  const qoqFlags = flagLargeQoQChanges(summary, getPriorQuarterValue, materialChangeThreshold ?? 0.3);
  for (const flag of qoqFlags) {
    const row = summary.find((candidateRow) => candidateRow.group === flag.group && candidateRow.field === flag.field);
    if (row) {
      row.action = "REVIEW_REQUIRED";
      row.notes = row.notes ? `${row.notes} ${flag.message}` : flag.message;
    }
    classified[flag.group][flag.field] = { ...classified[flag.group][flag.field], action: "REVIEW_REQUIRED", notes: row?.notes };
  }

  const existingQuarterKeys = financialsModule ? financialsModule.getAllQuartersForTicker(ticker).map((q) => q.quarter) : [];
  const guardrails = runAllGuardrails(classified, { existingQuarterKeys, allowReplay });

  const eligibility = checkDetailedActualEligibility(classified);
  const marketBoundary = evaluateMarketDataBoundary({
    ticker,
    quarterKey: classified.identity.quarterKey,
    hasMarketCapForQuarter: getMarketCapForQuarter,
    filingComplete: guardrails.valid && summary.every((row) => row.action !== "REVIEW_REQUIRED"),
  });

  const report = buildFullReport(classified, summary, {
    guardrailErrors: guardrails.errors,
    marketDataStatus: marketBoundary,
    forecastImpact: { latestDetailedActualEligible: eligibility.eligible, missingDetailFields: eligibility.missingFields },
  });

  return { candidate: classified, summary, report, company };
}

export async function loadCurrentCanonicalContext(root = process.cwd()) {
  const financialsModule = loadTsModule("lib/dashboard/financials-quarterly.ts", root);
  const marketCapModule = loadTsModule("lib/dashboard/market-cap-quarterly.ts", root);
  const historicalFile = JSON.parse(await readFile(path.join(root, "data", "historical.json"), "utf8"));
  return {
    financialsModule,
    historicalFile,
    getMarketCapForQuarter: (ticker, quarterKey) => Boolean(marketCapModule.getQuarterlyMarketCap(ticker, quarterKey)),
  };
}

/** AUTO_APPLY rows flattened to {path, value, classification} for the writers. */
function autoApplyRows(summary) {
  return summary
    .filter((row) => row.action === "AUTO_APPLY")
    .map((row) => ({ path: `${row.group}.${row.field}`, value: row.value, classification: row.classification }));
}

export async function applyCandidate({ candidate, summary, root = process.cwd(), historicalFile, allowPartial = false }) {
  const rows = autoApplyRows(summary);
  const sourceMeta = { accessionNumber: candidate.identity.accessionNumber, filingUrl: candidate.identity.sourcePath, filingType: candidate.identity.filingType };

  const historicalResult = applyHistoricalUpdate(historicalFile, candidate.identity.ticker, candidate.identity.quarterKey, rows, sourceMeta);
  if (historicalResult.written.length > 0) {
    await writeFile(path.join(root, "data", "historical.json"), serializeHistoricalFile(historicalResult.file), "utf8");
  }

  const financialsPath = path.join(root, "lib", "dashboard", "financials-quarterly.ts");
  const financialsSource = await readFile(financialsPath, "utf8");
  const financialsResult = insertQuarterIntoFinancialsQuarterly(financialsSource, candidate, { allowPartial });
  if (financialsResult.inserted) {
    await writeFile(financialsPath, financialsResult.source, "utf8");
  }

  let guidanceResult = null;
  if (candidate.guidance?.length > 0) {
    const guidancePath = path.join(root, "data", "management-guidance.json");
    const guidanceFile = JSON.parse(await readFile(guidancePath, "utf8"));
    guidanceResult = applyGuidanceUpdate(guidanceFile, candidate.identity.ticker, candidate.guidance);
    if (guidanceResult.added > 0) {
      await writeFile(guidancePath, serializeGuidanceFile(guidanceResult.file), "utf8");
    }
  }

  return { historicalResult, financialsResult, guidanceResult };
}

function parseArgs(argv) {
  const args = { dryRun: false, apply: false, allowPartial: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ticker") args.ticker = argv[++index]?.toUpperCase();
    else if (arg === "--year") args.year = Number(argv[++index]);
    else if (arg === "--quarter") args.quarter = argv[++index];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--manual-input") args.manualInputPath = argv[++index];
    else if (arg === "--allow-partial") args.allowPartial = true;
    else if (arg === "--allow-replay") args.allowReplay = true;
    else if (arg === "--material-change-threshold") args.materialChangeThreshold = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.ticker || !args.year || !args.quarter) {
    throw new Error("Usage: npm run sec:update -- --ticker TICKER --year YYYY --quarter QN (--dry-run | --apply) [--manual-input path.json]");
  }
  const quarterMatch = /^Q([1-4])$/.exec(args.quarter);
  if (!quarterMatch) throw new Error('--quarter must be one of Q1, Q2, Q3, Q4.');
  args.fiscalQuarter = Number(quarterMatch[1]);
  if (args.dryRun === args.apply) throw new Error("Specify exactly one of --dry-run or --apply.");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();

  const company = await loadConfiguredCompany(args.ticker, root);
  const manifest = await loadManifest(root);
  const companyFacts = await ensureCompanyFacts(args.ticker, { root, userAgent: process.env.SEC_USER_AGENT });
  const manualWorksheet = args.manualInputPath ? JSON.parse(await readFile(path.resolve(root, args.manualInputPath), "utf8")) : undefined;
  const { financialsModule, historicalFile, getMarketCapForQuarter } = await loadCurrentCanonicalContext(root);

  const { candidate, summary, report } = await buildCandidate({
    ticker: args.ticker,
    fiscalYear: args.year,
    fiscalQuarter: args.fiscalQuarter,
    root,
    manifest,
    companyFacts,
    manualWorksheet,
    financialsModule,
    historicalFile,
    getMarketCapForQuarter,
    materialChangeThreshold: args.materialChangeThreshold,
    allowReplay: args.allowReplay,
  });

  process.stdout.write(`${report.table}\n\n`);
  process.stdout.write(`Actions: ${JSON.stringify(report.actionCounts)}\n`);
  process.stdout.write(`Market data: ${report.marketDataStatus.status} -- ${report.marketDataStatus.note}\n`);
  process.stdout.write(`Forecast latest-detailed-actual eligible: ${report.forecastImpact.latestDetailedActualEligible}${report.forecastImpact.missingDetailFields.length ? ` (missing: ${report.forecastImpact.missingDetailFields.join(", ")})` : ""}\n`);
  if (report.guardrailErrors.length > 0) {
    process.stdout.write(`\nGUARDRAIL ERRORS (blocking apply):\n${report.guardrailErrors.map((e) => `  - [${e.code}] ${e.path}: ${e.message}`).join("\n")}\n`);
  }

  if (args.dryRun) {
    process.stdout.write("\nDry run only -- no files were modified.\n");
    if (!report.readyToApply) process.exitCode = 1;
    return;
  }

  if (!report.readyToApply) {
    process.stderr.write("\nRefusing to apply: guardrail errors present. Fix them and re-run --dry-run first.\n");
    process.exitCode = 1;
    return;
  }

  const { historicalResult, financialsResult, guidanceResult } = await applyCandidate({ candidate, summary, root, historicalFile, allowPartial: args.allowPartial });
  process.stdout.write(`\nhistorical.json: wrote ${historicalResult.written.length} metric(s), ${historicalResult.conflicts.length} conflict(s), ${historicalResult.unmapped.length} unmapped.\n`);
  process.stdout.write(`financials-quarterly.ts: ${financialsResult.inserted ? "inserted new quarter block" : `not modified (${financialsResult.reason})`}\n`);
  if (historicalResult.conflicts.length > 0) {
    process.stdout.write(`Conflicts (left untouched, needs manual resolution):\n${historicalResult.conflicts.map((c) => `  - ${c.metric}: existing ${c.existingValue} vs proposed ${c.proposedValue}`).join("\n")}\n`);
  }
  if (guidanceResult) {
    process.stdout.write(`management-guidance.json: added ${guidanceResult.added} entry(ies), skipped ${guidanceResult.skippedDuplicates.length} duplicate(s). Reporting-cycle bump eligible: ${guidanceResult.cycleBumpEligible} ${guidanceResult.cycleBumpBlockers.length ? `(blockers: ${guidanceResult.cycleBumpBlockers.join("; ")})` : ""}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
