import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadConfiguredSecTickers } from "./discover.mjs";
import { loadTsModule } from "./ts-runtime.mjs";
import { validateCanonicalConsistency, validateGuidanceOrdering } from "../../lib/sec-pipeline/guardrails.mjs";
import { CANDIDATE_TO_HISTORICAL_METRIC, CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH } from "../../lib/sec-pipeline/canonical-field-map.mjs";

/**
 * `npm run sec:validate` -- PHASE 8 guardrails run against the CURRENT state
 * of the canonical stores (not a single candidate). Checks:
 *  - historical.json and financials-quarterly.ts agree at the LATEST quarter
 *    per ticker (the one this pipeline actually writes to). This deliberately
 *    does NOT scan the full quarter history: this repo has a known, pre-existing
 *    ~272-item historical mismatch backlog (rounding/definition drift between
 *    the two stores across older quarters) that is explicitly out of scope for
 *    this pipeline to fix or even surface as noise on every run -- see
 *    tests/canonical-consistency.test.cjs, which uses the same single-checkpoint
 *    convention. Pass { fullHistory: true } to scan everything anyway (useful
 *    for a one-off audit, not for routine quarterly use).
 *  - every guidance entry in data/management-guidance.json has low <= midpoint <= high
 * Exits non-zero on any error, matching scripts/validate-config.mjs's convention.
 */

function navigate(node, path_) {
  for (const key of path_) {
    if (node == null) return undefined;
    node = node[key];
  }
  return node && typeof node === "object" && "value" in node ? node.value : undefined;
}

function latestQuarterOnly(quarters) {
  // "Qn YYYY" sorts correctly by year then quarter once split, not lexically (Q10 doesn't exist, so this is safe).
  return quarters
    .slice()
    .sort((a, b) => {
      const [, qa, ya] = /^Q(\d) (\d{4})$/.exec(a.quarter);
      const [, qb, yb] = /^Q(\d) (\d{4})$/.exec(b.quarter);
      return ya === yb ? Number(qa) - Number(qb) : Number(ya) - Number(yb);
    })
    .slice(-1);
}

export async function runCanonicalConsistencyCheck(root = process.cwd(), { fullHistory = false } = {}) {
  const tickers = await loadConfiguredSecTickers(root);
  const financialsModule = loadTsModule("lib/dashboard/financials-quarterly.ts", root);
  const historicalFile = JSON.parse(await readFile(path.join(root, "data", "historical.json"), "utf8"));

  const errors = [];
  for (const ticker of tickers) {
    const allQuarters = financialsModule.getAllQuartersForTicker(ticker);
    const quarters = fullHistory ? allQuarters : latestQuarterOnly(allQuarters);
    for (const quarter of quarters) {
      const quarterKey = quarter.quarter;
      for (const [candidatePath, metricName] of Object.entries(CANDIDATE_TO_HISTORICAL_METRIC)) {
        const fqPath = CANDIDATE_TO_FINANCIALS_QUARTERLY_PATH[candidatePath];
        if (!fqPath) continue;
        const financialsValue = navigate(quarter, fqPath);
        const historicalValue = historicalFile.companies?.[ticker]?.metrics?.[metricName]?.values?.[quarterKey];
        if (financialsValue === undefined || historicalValue === undefined || historicalValue === null) continue;
        errors.push(...validateCanonicalConsistency(historicalValue, financialsValue, { label: `${ticker} ${quarterKey} ${metricName}` }));
      }
    }
  }
  return errors;
}

export async function runGuidanceOrderingCheck(root = process.cwd()) {
  const guidanceFile = JSON.parse(await readFile(path.join(root, "data", "management-guidance.json"), "utf8"));
  const errors = [];
  for (const [ticker, company] of Object.entries(guidanceFile.companies ?? {})) {
    errors.push(...validateGuidanceOrdering(company.entries ?? []).map((error) => ({ ...error, path: `${ticker}.${error.path}` })));
  }
  return errors;
}

async function main() {
  const root = process.cwd();
  const fullHistory = process.argv.includes("--full-history");
  const consistencyErrors = await runCanonicalConsistencyCheck(root, { fullHistory });
  const guidanceErrors = await runGuidanceOrderingCheck(root);
  const allErrors = [...consistencyErrors, ...guidanceErrors];

  if (allErrors.length === 0) {
    process.stdout.write("sec:validate -- OK, no canonical-consistency or guidance-ordering errors found.\n");
    return;
  }

  process.stdout.write(`sec:validate -- ${allErrors.length} error(s):\n`);
  for (const error of allErrors) process.stdout.write(`  - [${error.code}] ${error.path}: ${error.message}\n`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
