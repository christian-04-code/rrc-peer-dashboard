# Runtime Validation Notes for Claude

## Completed in this pass

Runtime and build-time validation now protects the two controlling registries:

- `config/companies.json`
- `config/metric-definitions.json`

New files:

- `lib/validation/validation-types.ts`
- `lib/validation/company-registry-validation.ts`
- `lib/validation/metric-registry-validation.ts`
- `lib/validation/runtime-validation.ts`
- `scripts/validate-config.mjs`

Updated files:

- `app/layout.tsx`
- `package.json`

## How validation runs

### Application startup

`app/layout.tsx` calls `assertRuntimeRegistriesValid()` at module initialization.

- Registry errors stop startup/build with descriptive paths and error codes.
- Registry warnings are logged during non-production execution.
- Do not remove this assertion to work around a failing registry. Fix the registry or update the validator deliberately.

### Command line and build

Use:

```bash
npm run validate:config
npm run validate
npm run build
```

`npm run build` now runs `validate:config` before `next build`.

The CLI validator also checks that each configured logo file physically exists. Runtime TypeScript validation cannot reliably perform that filesystem check in the browser bundle, so the CLI is the controlling check for asset existence.

## Company registry checks

The validator currently checks:

- Supported schema version
- Existing and consistent default company
- Unique and valid display-order tickers
- Registry key/ticker agreement
- Required names, labels, descriptions, region and basin fields
- Approved logo path shape and accessible alt text
- Non-empty map default view
- Unique exposure and route keys
- Exactly one enabled default-selected company
- Recognized exchange warning

## Metric registry checks

The validator currently checks:

- Supported schema version
- Existing categories and metric definitions
- Uppercase snake-case metric keys
- Required labels, units, value types and aggregation values
- Defined categories
- Required aliases and duplicate aliases within a metric
- Cross-metric alias collisions as warnings rather than silent resolution
- Historical, guidance, consensus and market support flags
- Homepage, chart, map, source and peer-comparison UI flags
- Source-required and homepage/chart consistency warnings

## Important behavior

Alias collisions across different metrics are warnings because some source labels are inherently ambiguous. Adapters must resolve them using source context and must not choose a metric solely from a collided alias.

Validation does not certify financial correctness. It certifies registry structure and internal consistency. Source lineage, period basis, units and metric definitions remain governed by the data model and source rules.

## First task when resuming

Run:

```bash
npm install
npm run validate:config
npm run typecheck
npm run build
```

If validation fails, fix only the specific registry or validator mismatch shown. Do not weaken validation globally to make the build pass.

## Next logical additions

1. Add validator tests with intentionally invalid fixtures.
2. Add `npm run validate` to GitHub Actions.
3. Validate comparison preferences against the company registry.
4. Validate future map-layer keys against `config/map-layers.json` once that file exists.
5. Validate normalized dashboard records against metric keys and company tickers when adapters are added.
