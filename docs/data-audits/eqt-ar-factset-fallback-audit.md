# EQT and AR FactSet Historical Fallback Audit

## Scope

Review the EQT and AR worksheets in the FactSet E&P Company Model against the primary Range quarterly Codex template for Q1 2024 through Q1 2026.

The project source hierarchy remains:

1. Codex quarterly template built from company filings and earnings materials.
2. FactSet E&P workbook as a per-cell historical fallback only.

FactSet values must not overwrite a populated Codex value and must remain source-tagged.

## Accepted fallback series

### EQT Free Cash Flow ($MM)

| Quarter | FactSet FCF |
|---|---:|
| Q1 2024 | 401.554 |
| Q2 2024 | -171.000 |
| Q3 2024 | -47.000 |
| Q4 2024 | 580.223 |
| Q1 2025 | 1,151.000 |
| Q2 2025 | 240.000 |
| Q3 2025 | 601.000 |
| Q4 2025 | 743.866 |
| Q1 2026 | 1,832.000 |

### AR Free Cash Flow ($MM)

| Quarter | FactSet FCF |
|---|---:|
| Q1 2024 | 29.874 |
| Q2 2024 | -42.8755 |
| Q3 2024 | -6.000 |
| Q4 2024 | 160.000 |
| Q1 2025 | 336.4715 |
| Q2 2025 | 179.000 |
| Q3 2025 | -145.500 |
| Q4 2025 | 186.500 |
| Q1 2026 | 464.550 |

## Classification

All accepted values are recorded as:

- source: `factset`
- basis: `derived`
- period: standalone historical quarter
- unit: $MM

They are fallback values only and must be replaced rather than blended if a filing-verified Codex series is added later.

## Rejected or excluded fields

- Production, realized pricing, revenue, EBITDAX, CapEx, and net debt were not overwritten because the Codex template already controls those historical series.
- EQT and AR FactSet net-debt reconciliation rows contain multiple `REVIEW` or `REFRESH` statuses and were not used as replacements.
- FactSet contains no comparable wells drilled, TIL, DUC inventory, or normalized unit-cost rows for this fallback pass.
- Forecast periods after Q1 2026 were excluded.

## Conclusion

The complete nine-quarter EQT and AR FactSet FCF rows are accepted as secondary per-cell fallbacks. No other historical series were imported in this pass.
