# Company Registry Runtime Acceptance Checklist

Claude should verify these behaviors after installing dependencies and running the app.

## Identity switching

For each enabled ticker in `config/companies.json`:

- selector button is visible in configured order
- selector label matches the registry
- correct logo asset renders
- logo alt text matches the registry
- company short name updates
- description updates
- exchange and ticker update
- previous company branding is no longer visible

## Map context

After selecting a company:

- primary region comes from the registry
- primary basin comes from the registry
- default map-view label comes from the registry
- exposure-key summary comes from the registry
- empty exposure arrays show an explicit missing-data state
- no coordinates, routes, or boundaries are inferred

## Integrity

- `HomeDashboard.tsx` contains no duplicated company identity object
- selector generation uses `selectableCompanies`
- default selection uses `defaultTicker`
- identity lookup uses `getCompany`
- runtime logos are centralized in `logoByTicker`
- unknown ticker values fail safely rather than silently displaying RRC

## Regression checks

- RRC remains selected on first load
- AR comparison toggle still functions
- metric switching still functions
- Chart/Map toggle still functions
- fixture metrics still display explicit pending states for unsupported peers
- source/detail drawer still opens and closes
