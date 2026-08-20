# Baker Hughes rig count refresh

The Macro map's rig activity overlay and Drilling Activity module use rig counts
extracted from Baker Hughes' weekly "North America Rig Count Report" workbook
into a static JSON snapshot. Excel formulas never run in the application or on
Vercel -- only the stored/cached values in the workbook are read, and only the
committed JSON is read at runtime (there is no live Baker Hughes API call, and
no dependency on the source workbook's filesystem path in production).

## Why a snapshot, not a live feed

Baker Hughes does not publish a stable, machine-readable API or a fixed-URL
recurring download for the North America rig count; it is distributed as a
new workbook each Friday. Building a scraper against a page whose markup or
URL Baker Hughes controls (and could change without notice) would be a fragile
dependency for a production Vercel deployment. A committed snapshot with a
documented, repeatable update step is the same tradeoff this repository
already makes for stock price history (`docs/stock-history-import.md`) and
management guidance -- it keeps production reads local and instant, and keeps
the update step auditable (a diffable JSON file, reviewed before commit).

## Updating the snapshot

1. Download the current week's `North_America_Rig_Count_Report_*.xlsx` from
   Baker Hughes and place it anywhere outside the repository (for example
   alongside the other source workbooks in `../Peer_Comp_Site_Data/`).
2. From the repository root, run:

   ```sh
   npm run rigs:import -- "../Peer_Comp_Site_Data/Baker Huges/North_America_Rig_Count_Report_<date>.xlsx"
   ```

3. Review the printed report date, US total, tracked-state count, and basin
   count, then commit the updated `data/rigs/rig-count.json`.

## What the import does

The script reads two sheets:

- **NAM Breakdown** -- the authoritative current / prior-week / week-over-week
  / year-ago / year-over-year figures for the Location, DrillFor, Trajectory,
  Country, Basin and State section tables. These are the numbers Baker Hughes
  itself publishes as the current week's headline figures, taken verbatim.
- **NAM Weekly** -- one row per Country/County/Basin/DrillFor/State/Trajectory/
  publish-date combination, going back roughly 2.5 years. Used to derive the
  state-level gas/oil/trajectory split, the top-county activity concentration
  per state, and the last 52 published weeks of history per state (all of
  which the Breakdown sheet does not carry per-state).

Before writing output, the import **cross-validates** the two sheets: for
every tracked state, the latest-week sum of NAM Weekly rows must match the
NAM Breakdown state total exactly (within floating-point rounding); basin
totals must reconcile to the US total; and state totals must reconcile to the
US total. Any mismatch fails the import loudly rather than writing a silently
inconsistent snapshot.

Only the ~32 states Baker Hughes individually breaks out in the State section
are included in `states`; a state absent from that section is not assumed to
be zero -- the app renders it as "not individually tracked," distinct from a
state that is tracked and currently at zero rigs.

The import fails rather than silently dropping malformed rows: it validates
sheet names, required section headers, numeric cells, publish dates, and the
reconciliation checks above.

## Consuming the snapshot

`lib/rigs/rig-data.ts` reads `data/rigs/rig-count.json` directly (the same
import-JSON-directly pattern as `lib/market/workbook-stock-history.ts`) and
exposes typed accessors (`getRigState`, `getRigDataset`, etc.). Components
never parse the workbook or the raw JSON shape themselves.
