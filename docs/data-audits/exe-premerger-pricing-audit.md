# EXE Pre-Merger Realized Pricing Audit

## Scope

Review the three plausible FactSet historical fallback candidates for Expand Energy (EXE):

- Q2 2024 realized oil price: $80.67/Bbl
- Q3 2024 realized oil price: $75.09/Bbl
- Q3 2024 realized NGL price: $24.70/Bbl

The Range quarterly Codex template remains the primary historical source. FactSet is used only as a per-cell fallback when the historical period, company scope, units, and metric definition are directly comparable.

## Company-scope finding

Expand Energy did not exist in its current combined form during Q1-Q3 2024. The October 2024 combination joined legacy Chesapeake Energy and Southwestern Energy. Therefore, any pre-merger EXE series must be explicitly identified as a predecessor-company series before it can be used.

Expand Energy's official Q3 2024 results state that legacy Chesapeake produced approximately 2.65 Bcfe/d and was 100% natural gas. The same disclosure describes 30 wells drilled, seven wells turned in line, 18 DUCs, and 12 deferred TILs for legacy Chesapeake.

Because legacy Chesapeake's disclosed Q3 2024 production was 100% natural gas, FactSet's Q3 2024 oil and NGL realized-price observations cannot be treated as comparable legacy-Chesapeake realized prices for the normalized EXE historical series.

## Decisions

| Quarter | Metric | FactSet value | Decision | Reason |
|---|---|---:|---|---|
| Q2 2024 | Realized oil price | $80.67/Bbl | Reject | Pre-merger predecessor basis is not identified and cannot be tied to a comparable EXE operating series. |
| Q3 2024 | Realized oil price | $75.09/Bbl | Reject | Legacy Chesapeake disclosed 100% natural-gas production for Q3 2024; the value cannot represent a comparable legacy-Chesapeake operating realization. |
| Q3 2024 | Realized NGL price | $24.70/Bbl | Reject | Legacy Chesapeake disclosed 100% natural-gas production for Q3 2024; the value cannot represent a comparable legacy-Chesapeake operating realization. |
| Q1 2024 | Realized oil price | $0.00/Bbl | Reject | Zero is not accepted as evidence of a disclosed realization and may reflect missing/nonapplicable data. |
| Q1-Q2 2024 | Realized NGL price | $0.00/Bbl | Reject | Continuous zeros are not accepted as verified historical realizations. |

## Dataset treatment

- Keep the affected pre-merger EXE realized oil and NGL cells blank.
- Do not convert the rejected FactSet values to zero.
- Do not blend legacy Chesapeake and Southwestern pricing into a synthetic EXE historical series.
- Preserve FactSet as a secondary source only.
- Replace these blanks only if a future filing-supported predecessor mapping is added with explicit company scope and matching metric definitions.

## Source references

- Expand Energy Q3 2024 results: legacy Chesapeake production was approximately 2.65 Bcfe/d and 100% natural gas.
- FactSet E&P Company Model, EXE worksheet, quarterly operating model.
- Range quarterly Codex template, EXE worksheet, Q1 2024-Q1 2026 historical series.

## Audit conclusion

No pre-merger realized oil or NGL FactSet values were accepted. The intentional blanks are the correct audit-ready outcome under the project's historical-data rules.
