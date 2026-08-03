# Company Registry Usage

The dashboard must read company identity and default UI behavior from `config/companies.json`.

## Required behavior

- Generate the company selector from `displayOrder` and `companies`.
- Use `defaultCompany` for the initial homepage selection.
- Load the selected company's logo from `companies[ticker].logo.path`.
- Use the ticker fallback mark when the image cannot load.
- Update company identity and analytical context atomically.
- Never leave the previously selected company's logo, metrics, chart series, map exposure, insights, or sources visible after selection completes.

## Recommended lookup

```ts
import companiesConfig from "../../config/companies.json";

export type CompanyTicker = keyof typeof companiesConfig.companies;

export function getCompany(ticker: CompanyTicker) {
  return companiesConfig.companies[ticker];
}
```

## Logo component behavior

```tsx
type CompanyLogoProps = {
  ticker: CompanyTicker;
  size?: "sm" | "md" | "lg";
};
```

The component should:

1. Resolve the logo from the registry.
2. Render the registry-provided alt text.
3. Use `object-fit: contain` so differently proportioned logos remain readable.
4. Fall back to a neutral ticker mark on error.
5. Avoid hard-coded per-company imports inside dashboard components.

## Map data rule

The registry contains high-level map keys only. Do not infer coordinates, operating boundaries, pipelines, routes, terminals, or acreage polygons from those keys. Authoritative geographic datasets must provide the actual geometry.

## Adding a company

A company is not dashboard-ready until all of the following are supplied:

- Registry entry
- Valid ticker and company name
- Logo path and alt text
- Selector label and description
- Business-region metadata
- Default map view
- Data-availability flags

After adding the entry, validate company selection, logo switching, chart context, map context, insights, and sources before enabling it in the selector.
