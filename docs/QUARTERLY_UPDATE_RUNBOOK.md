# Quarterly SEC Update Runbook

How to bring a new quarter's filing into the dashboard: `data/sec/` → candidate → review → apply → propagate.

Everything here is **review-first**. Nothing is written to canonical data without an explicit `--apply`, and `--apply` itself refuses to write any field that isn't classified `AUTO_APPLY` (or, for a brand-new quarter block, explicitly approved via `--allow-partial`). See `lib/sec-pipeline/` for the implementation and `tests/sec-pipeline-*.test.cjs` for the behavior this document describes, proven against real SEC data.

## 1. Detect and download the new filing

```
npm run sec:sync -- RRC          # or: npm run sec:sync -- ALL
npm run sec:xbrl -- RRC          # caches XBRL "company facts" JSON alongside the filing.htm
npm run sec:check                # quick status: which tickers have a filing not yet in financials-quarterly.ts
```

`sec:sync` (existing, unchanged) discovers new 10-Q/10-K filings via the SEC submissions API, updates `data/sec/manifest.json`, and downloads the filing HTML to `data/sec/<TICKER>/<reportDate>/<accession>/filing.htm`. `sec:xbrl` is new: it fetches `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` and caches it at `data/sec/<TICKER>/companyfacts.json` (gitignored — a few MB per company, trivially regenerable, not a primary source document like the filing HTML). This is the only additional SEC source the pipeline needs, and it's the one genuinely deterministic source: every fact carries an exact reporting period and standardized unit.

`sec:check` is read-only and safe to run any time.

## 2. Dry-run extraction

```
npm run sec:update -- --ticker RRC --year 2026 --quarter Q3 --dry-run
```

Prints a report table:

```
FIELD                     CURRENT   PROPOSED  SOURCE    CLASS  CONFIDENCE  ACTION
financial.revenue         --        912.4     sec-xbrl  A      high        AUTO_APPLY
financial.adjustedEbitdax --        --        unavailable D    n/a         LEAVE_BLANK
financial.capitalExpenditures --    240.0     sec-xbrl  C      medium      REVIEW_REQUIRED
...
```

**No files are modified in dry-run mode**, regardless of what the report shows.

### What gets auto-extracted

Only a handful of fields are pulled deterministically from XBRL, and only when the exact 3-month reporting window matches (comparative-year columns and YTD/6-month facts are rejected by construction, not filtered by convention):

- `financial.revenue` — `us-gaap:Revenues` (or the contract-revenue equivalent)
- `financial.dilutedShares` — `us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding`

Everything else — production, pricing, per-unit costs, wells/TILs, `adjustedEbitdax` (non-GAAP), `capitalExpenditures`, and `netDebt` — is **not** standardized in XBRL across these seven issuers, or is deliberately treated as ambiguous even when an XBRL tag technically matches (see "Known error classes" below). Those fields need a manual worksheet.

### Classification, in one paragraph

Every field carries a classification (A/B/C/D) and an action:

- **A** — exact XBRL match, one candidate, right period → `AUTO_APPLY` (unless a differing value is already on file for this exact quarter, in which case it's always `REVIEW_REQUIRED`, no matter how small the difference — this is the one case this pipeline treats as never-negotiable).
- **B** — derived purely from other A/B fields (net debt = debt − cash, commodity mix %, total cash unit costs, standalone Q4 = FY − 9mo) → `AUTO_APPLY` under the same same-quarter-conflict rule, and additionally downgraded to `REVIEW_REQUIRED` if it moved >30% vs. the **prior** quarter (classification-A fields are exempt from this check — an exact XBRL match is trusted even if the number moved a lot).
- **C** — manual-worksheet input, or an XBRL field this repo treats as inherently ambiguous → always `REVIEW_REQUIRED`.
- **D** — not disclosed / not extracted → `LEAVE_BLANK`, never guessed.

## 3. Review-required fields: the manual worksheet

For anything classification C, write a small JSON worksheet (the person who reads the filing/earnings release fills this in):

```json
{
  "production": {
    "total": { "value": 2312.1, "unit": "MMcfe/d", "sourceLocation": "RRC Q3 2026 10-Q, MD&A production table, p.20" }
  },
  "pricing": {
    "realizedGas": { "value": 2.95, "unit": "$/Mcf", "sourceLocation": "..." }
  },
  "financial": {
    "capitalExpenditures": { "value": 230, "unit": "$MM", "sourceLocation": "RRC Q3 2026 earnings release, p.3", "note": "company-reported all-in capital spending, matching this repo's RRC convention" }
  },
  "guidance": [
    { "metric": "capex", "low": 900, "midpoint": 925, "high": 950, "unit": "$MM", "period": "FY 2026", "status": "reaffirmed", "reportingCycle": "Q3 2026", "source": "Q3 2026 Earnings Release", "directVsDerived": "direct", "chartable": true }
  ]
}
```

Every worksheet entry still comes through as classification C (`REVIEW_REQUIRED`) — the worksheet is the sanctioned path for a human-read number to enter the pipeline, not a bypass around review.

```
npm run sec:update -- --ticker RRC --year 2026 --quarter Q3 --dry-run --manual-input worksheet.json
```

Re-run the dry-run until the report shows what you expect. `financial.capitalExpenditures` and `financial.netDebt` are **always** routed through the worksheet, even though an XBRL tag often technically matches — see the known-error-classes list below for why.

## 4. Apply

```
npm run sec:update -- --ticker RRC --year 2026 --quarter Q3 --manual-input worksheet.json --apply
```

- Writes `AUTO_APPLY` fields into `data/historical.json` (additive only — if a value is already recorded for that exact ticker/quarter/metric and it differs from the proposed one, it's reported as a **conflict** and left untouched, never overwritten).
- Inserts a brand-new `"Q3 2026": { ... }` block into `lib/dashboard/financials-quarterly.ts` (text-surgery, brace-matched — never touches an existing quarter's block, never rewrites the file wholesale). Refuses if any mapped field is still `REVIEW_REQUIRED`, unless you pass `--allow-partial` (which inserts with those specific fields left `null` and an explanatory note — never the unresolved proposed value).
- Writes any `candidate.guidance` entries into `data/management-guidance.json`, appended (never deletes/overwrites prior-cycle entries).

If guardrail errors are present, `--apply` refuses outright — fix them and re-run `--dry-run` first.

## 5. Downstream propagation (automatic, nothing to do here)

Once `financials-quarterly.ts` and `historical.json` have the new quarter, everything that already reads from them picks it up on the next build with no separate step: Overview cards, Peer Comparison tables/charts, quarterly financial/operating panels, and guidance overlays. This was true before this pipeline existed — the pipeline's job stops at "write the canonical files correctly," not at re-deriving the UI layer.

**Forecast baseline is the one deliberate exception.** The new quarter is recorded as the latest actual, and becomes eligible as the "latest detailed actual" anchor once every detail field (production, pricing, LOE/GPT/G&A) is resolved (not blank, not review-pending) — but the pipeline **never** edits a `lib/forecast/data/*-baseline.ts` or `lib/forecast/scenarios/*.ts` file itself. `sec:update`'s report includes a forecast-safety section: it flags `REVIEW_REQUIRED` if the new quarter's realized value for a classification-B field (e.g. a pricing differential) diverges materially from the forecast's current forward assumption for that same line item — this is precisely the RRC gas-differential class of bug (a single realized quarter silently overriding management's own forward guidance). Promoting a quarter to the Forecast baseline stays a manual step in the relevant `lib/forecast/data/*-baseline.ts` / `lib/forecast/scenarios/*.ts` files, following the existing superseded-baseline convention (old baseline objects stay in the file, marked superseded, per `rrcQ1_2026Baseline` in `lib/forecast/data/rrc-baseline.ts`).

## 6. Market-cap / valuation boundary

This pipeline only ever touches SEC/company-reported data. Share price and market cap come from a separate, currently hand-maintained source (`lib/dashboard/market-cap-quarterly.ts`, sourced from macrotrends/yahoo-finance/nasdaq-historical). The dry-run and apply reports both include a `marketDataStatus`:

- `complete` — filing data applied and market cap already on file for this quarter → valuation panels are refreshed.
- `waiting-on-market-data` — filing data is fine, but no market cap recorded yet for this quarter. This is a flagged follow-up, not something the pipeline estimates or fabricates. Add the quarter-end close × diluted-shares figure to `market-cap-quarterly.ts` by hand (same convention already used there).
- `waiting-on-filing-data` — some filing-derived field is still `REVIEW_REQUIRED`; valuation isn't ready regardless of market data.

## 7. Guidance

Guidance entries pass through the same worksheet/apply flow (§3–4). `data/management-guidance.json` has a single file-level `meta.reportingCycle` used to decide what counts as "current" for **every** company at once (`lib/dashboard/guidance.ts`'s `isCurrentRecord`). Because of that, `sec:update` **never** bumps `meta.reportingCycle` automatically — it only reports whether bumping is "eligible" (every roster company already has at least one entry tagged with the new cycle) and lists which tickers are still blocking it. Bumping the cycle is a deliberate, separate manual edit to `data/management-guidance.json`'s `meta.reportingCycle`, made only once every company you care about has rolled forward — otherwise you'd silently hide a peer's still-current guidance.

Prior-cycle entries are never deleted, only left with their original `reportingCycle` (matching the existing "Q1 2026 holdover" entries already in the file).

## 8. Validate

```
npm run sec:validate
```

Checks (latest quarter per ticker only, by default — see below): `historical.json` and `financials-quarterly.ts` agree at the latest quarter, and every guidance entry has `low <= midpoint <= high` where both are present. Exits non-zero on any error.

This deliberately does **not** scan the full quarter history by default (`--full-history` opt-in exists for a one-off audit): this repo has a known, pre-existing ~272-item historical mismatch backlog across older quarters that is explicitly out of scope for this pipeline. Scanning it on every run would bury real, fresh regressions in old noise.

## 9. Tests

```
npm test                    # full suite, includes tests/sec-pipeline-*.test.cjs
npm run typecheck
npm run build
```

The `sec-pipeline-replay-*.test.cjs` files replay this pipeline against real SEC XBRL data (trimmed, committed fixtures under `tests/fixtures/sec-pipeline/`, originally fetched live from `data.sec.gov`) for RRC and AR Q2 2026, and assert the extracted values match the already-approved production data exactly. They also lock in a genuine finding from that replay: AR's raw XBRL diluted-share fact legitimately disagrees with the canonical, human-transcribed figure for the same filing by about 0.8% — proving the pipeline surfaces that as `REVIEW_REQUIRED` rather than silently overwriting a settled number.

## 10. Deployment

No change to the existing deploy flow. This branch does not touch `app/`, Vercel config, or the build pipeline beyond adding `npm run validate:config`-style scripts. Once a quarter is applied and committed, it ships the same way any other content change does.

## 11. Rollback

- **Before commit:** `git checkout -- data/historical.json lib/dashboard/financials-quarterly.ts data/management-guidance.json` discards the applied changes; nothing else was touched.
- **After commit, before merge:** revert the commit on the feature branch.
- **After merge:** revert the merge commit, or hand-edit the specific quarter block/metric back out — since inserts are additive and scoped to one new quarter block, a revert is a clean, isolated diff, not a mixed-in rewrite.
- Conflicts reported during apply (an existing value that disagrees with a freshly proposed one) are **never** written in the first place, so there's nothing to roll back for those — resolve them by editing the correct file directly once you've determined which source is right.

## Known error classes this pipeline is built to prevent

(See `lib/sec-pipeline/xbrl.mjs`, `scripts/sec/update.mjs`'s `AMBIGUOUS_XBRL_FIELDS`, and `lib/sec-pipeline/guardrails.mjs`.)

| Error | How it's prevented |
|---|---|
| Wrong comparative-year column | XBRL facts are matched on exact `start`/`end` dates, not just a "fp"/"fy" label; no exact match → blank, not a guess |
| YTD mistaken for standalone quarter | Duration is checked (80–100 days); a 6-month YTD fact is refused by default |
| 7.5 vs 7,500 unit errors | `guardrails.validateUnitRanges` checks each field against a plausible range per unit |
| D&C-only CapEx mistaken for total CapEx | `capitalExpenditures` is never `AUTO_APPLY` from raw XBRL — always routed to the manual worksheet |
| Completed wells mistaken for TILs | `wellsDrilled`/`tils` are always manual-worksheet fields (classification C), never inferred |
| Post-hedge pricing mixed with pre-hedge pricing | Realized pricing is always manual-worksheet, with `sourceLocation` required per entry |
| Total G&A mixed with cash G&A | Same — manual worksheet, source-location required, per-company convention documented in the worksheet's `note` |
| Carrying-value debt mixed with face-value debt | `netDebt`'s XBRL-extracted debt component is downgraded to classification C, so `deriveNetDebt` refuses to compute it without a manual, source-confirmed figure |
| Silent overwrite of a settled value | `classify.mjs`: any disagreement with an already-recorded value for the same ticker/quarter is `REVIEW_REQUIRED`, regardless of magnitude (see the AR diluted-shares finding above) |

## Operator commands, quick reference

```
npm run sec:check
npm run sec:sync -- <TICKER|ALL>
npm run sec:xbrl -- <TICKER>
npm run sec:update -- --ticker <TICKER> --year <YYYY> --quarter <Q1|Q2|Q3|Q4> --dry-run [--manual-input worksheet.json]
npm run sec:update -- --ticker <TICKER> --year <YYYY> --quarter <Q1|Q2|Q3|Q4> --apply [--manual-input worksheet.json] [--allow-partial]
npm run sec:validate [-- --full-history]
```
