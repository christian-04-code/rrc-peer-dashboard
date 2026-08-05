# CNX FactSet Fallback Audit

## Scope

Compare the CNX historical series in the Range quarterly Codex template against the CNX worksheet in the FactSet E&P company model for Q1 2024 through Q1 2026.

The Codex template remains the primary historical source. FactSet is used only as a per-cell fallback when the Codex template is blank and the FactSet series is historical, quarter-specific, and definitionally usable.

## Accepted fallback

FactSet contains a complete quarterly Free Cash Flow row for CNX covering all nine required quarters. The Codex historical template does not currently contain a CNX FCF series, so the following values were accepted as secondary-source fallbacks:

| Quarter | FCF ($MM) |
|---|---:|
| Q1 2024 | 25 |
| Q2 2024 | 47 |
| Q3 2024 | 60 |
| Q4 2024 | 199 |
| Q1 2025 | 100 |
| Q2 2025 | 188 |
| Q3 2025 | 226 |
| Q4 2025 | 132 |
| Q1 2026 | 139 |

All accepted values are tagged `source: factset` and `basis: derived`. They must be replaced rather than blended if a filing-verified Codex FCF series is added later.

## Rejected or unused categories

### Net debt

FactSet's reported net debt row contains multiple `#N/A` observations, and every quarter in the model-check section is marked `REVIEW` or `REFRESH`. These values were not used as fallbacks.

### Production, realized pricing, revenue, EBITDAX, and capital expenditures

These historical series are already populated in the Codex normalized dataset. FactSet was not permitted to overwrite stronger Codex values.

### Wells drilled, TILs, DUC inventory, and normalized unit costs

The FactSet CNX staging sheet does not contain directly comparable historical rows for these metrics. No fallback values were added.

### Forecast periods

All periods after Q1 2026 were excluded.

## Dataset treatment

- Codex values remain controlling.
- FactSet is used only for the accepted CNX FCF cells.
- Missing values are not converted to zero.
- Reconciliation-check failures are not imported.
- No forecast or estimate periods are mixed into historical actuals.

## Source references

- Range quarterly Codex template, CNX worksheet, Q1 2024-Q1 2026.
- FactSet E&P Company Model, CNX worksheet, historical quarterly operating model.

## Audit conclusion

The only accepted CNX fallback is the nine-quarter Free Cash Flow series. No other CNX FactSet values were added.