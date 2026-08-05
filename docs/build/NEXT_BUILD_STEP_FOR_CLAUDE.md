# Next Build Step for Claude

The company registry is now wired into the runtime homepage. Do not spend time rebuilding that layer.

Start here:

1. Install dependencies.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Fix only concrete failures.
5. Add registry validation tests.
6. Add Escape-to-close and focus trapping to the detail drawer.
7. After the shell is stable, replace the AR-only comparison toggle with a registry-driven multi-company comparison selector.

Do not begin live API integration or geographic data work until the project builds cleanly.
