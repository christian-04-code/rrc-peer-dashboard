# GPOR FactSet Fallback Audit

## Scope

Audit Gulfport Energy (GPOR) historical values for Q1 2024 through Q1 2026 using the project source hierarchy:

1. Range quarterly Codex template as the primary filing-derived source.
2. FactSet E&P Company Model as a per-cell historical fallback only where the Codex template is blank.

FactSet values must not overwrite existing Codex values. Forecast columns, unsupported zeros, and model-only reconciliation outputs are excluded.

## Accepted fallback

The Codex template does not currently contain a verified GPOR quarterly free cash flow series. The FactSet GPOR worksheet contains a complete historical Free Cash Flow row for all nine required quarters.

| Quarter | FactSet FCF ($MM) | Decision |
|---|---:|---|
| Q1 2024 | 53.00 | Accept as FactSet fallback |
| Q2 2024 | 26.00 | Accept as FactSet fallback |
| Q3 2024 | 58.00 | Accept as FactSet fallback |
| Q4 2024 | 125.21 | Accept as FactSet fallback |
| Q1 2025 | 36.60 | Accept as FactSet fallback |
| Q2 2025 | 73.85 | Accept as FactSet fallback |
| Q3 2025 | 105.00 | Accept as FactSet fallback |
| Q4 2025 | 129.25 | Accept as FactSet fallback |
| Q1 2026 | 124.20 | Accept as FactSet fallback |

All accepted values are stored as:

- `source: "factset"`
- `basis: "derived"`
- standalone quarterly values in $MM

If a filing-verified Codex series is added later, it should replace these values rather than be blended with them.

## Existing Codex values retained

FactSet also contains historical rows for production, realized prices, revenue, EBITDAX, capital expenditures, and net debt. These were not imported because the primary Codex template already contains the normalized GPOR historical series for those metrics.

## Rejected or unavailable fallback categories

### Wells drilled
No comparable FactSet historical row was present.

### Wells turned in line
No comparable FactSet historical row was present.

### DUC inventory
No comparable FactSet historical row was present.

### Unit-cost rows
The FactSet staging sheet does not provide the normalized project rows for:

- Lease operating expense / Mcfe
- Gathering / processing / transportation / Mcfe
- Cash G&A / Mcfe
- Total cash unit costs / Mcfe

These cells must remain controlled by Codex filing-derived values or remain blank.

### Net debt reconciliation outputs
FactSet's net debt reconciliation status is marked `REVIEW` for Q3 2024 and Q4 2025. No FactSet net debt values were imported because Codex already controls the series and reconciliation outputs are not historical source values.

### Forecast periods
Q2 2026 and later forecast columns were excluded from the historical audit.

## Audit conclusion

The only accepted GPOR fallback in this pass is the nine-quarter Free Cash Flow series. No other FactSet values were needed or sufficiently additive to the Codex-controlled dataset.
