import Link from "next/link";
import { SectionLabel } from "@/components/SectionLabel";

export default function ValuationPage() {
  return (
    <main className="mx-auto max-w-[1220px] px-5 py-7 sm:px-8">
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-semibold text-white">Valuation</h1>
        <p className="mt-1 max-w-[640px] text-[13px] text-text-dim">
          EV / EBITDAX, FCF yield, leverage, and peer valuation ranges under forecast scenarios.
        </p>
      </div>

      <SectionLabel>Not Yet Built</SectionLabel>
      <div className="rounded-[10px] border border-border bg-panel px-6.5 py-8">
        <div className="max-w-[680px] font-mono text-[12.5px] leading-relaxed text-text-dim">
          <p className="mb-3 text-text">
            This page is a placeholder. Dynamic valuation outputs depend on the forecast engine (Layer 3), which has not
            been implemented yet.
          </p>
          <p className="mb-3">
            No valuation figures are displayed here. Live-share-price-driven multiples (EV / EBITDAX, FCF Yield, Net Debt
            / EBITDAX under forecast scenarios) will only appear once they can be computed from traceable inputs — live
            share price, shares outstanding, net debt, and forecast EBITDAX / FCF — rather than hard-coded.
          </p>
          <p>
            Historical (actual, non-forecast) EV / LTM EBITDAX and leverage are already available on the{" "}
            <Link href="/" className="text-blue-soft underline">
              Overview
            </Link>{" "}
            page, sourced directly from <code>data/historical.json</code>.
          </p>
        </div>
      </div>
    </main>
  );
}
