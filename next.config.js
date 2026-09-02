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
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
    // Externalizing alone isn't enough: @vercel/nft's static file trace
    // still can't see @sparticuz/chromium's bin/*.br binary assets (loaded
    // internally via a dynamically-built path, not a literal string it can
    // follow) -- confirmed locally by inspecting the emitted .nft.json for
    // this exact route, which listed the package's .js files but none of
    // its bin/ contents. Force-including them here is the documented fix.
    // IMPORTANT for whoever builds Phase 7F's real cron route: add its
    // route path as another key here too, or this same failure recurs.
    outputFileTracingIncludes: {
      "/api/diagnostic-7d2-chromium": ["./node_modules/@sparticuz/chromium/bin/**"]
    }
  }
};

module.exports = nextConfig;
