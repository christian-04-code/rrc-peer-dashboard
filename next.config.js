/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 7D.2: @sparticuz/chromium ships non-JS binary assets (bin/*.br)
  // that it locates at runtime via paths relative to its own installed
  // location. Next.js's default Server Components/Route Handler bundling
  // would otherwise pull it into the webpack graph and relocate it, which
  // breaks that runtime path lookup -- confirmed live on Vercel Preview via
  // the exact error @sparticuz/chromium itself throws for this case ("you
  // must externalize @sparticuz/chromium so it is not relocated"). This
  // opts it out of that bundling so the weekly-report PDF renderer
  // (lib/reports/render/pdf-renderer.ts) can resolve it with native
  // Node.js require/import at runtime instead. See
  // docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md §29.10 for the full record.
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium"]
    // Externalizing alone was NOT enough: @vercel/nft's static file trace
    // still cannot see @sparticuz/chromium's bin/*.br binary assets (loaded
    // internally via a dynamically-built path, not a literal string it can
    // follow) -- confirmed live end-to-end on a real Vercel Preview
    // invocation of a Phase 7D.2 diagnostic route (chromium launched,
    // rendered, and produced a valid PDF within the page-count limit) that
    // additionally set:
    //
    //   outputFileTracingIncludes: {
    //     "<the route's own path, e.g. /api/cron/reports>": ["./node_modules/@sparticuz/chromium/bin/**"]
    //   }
    //
    // Removed here now that the diagnostic route itself is gone (an entry
    // keyed to a route that no longer exists is dead config, and this key
    // is scoped per-route rather than global specifically so unrelated API
    // routes never carry chromium's ~65MB of binary assets into their own
    // deployment bundle unnecessarily). RE-ADD this outputFileTracingIncludes
    // entry, keyed to its own real route path, the moment any future phase
    // (7F's scheduled orchestration route, most likely) calls
    // ChromiumPdfRenderer -- otherwise this exact failure recurs.
  }
};

module.exports = nextConfig;
