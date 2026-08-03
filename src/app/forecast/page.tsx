import { SectionLabel } from "@/components/SectionLabel";

export default function ForecastPage() {
  return (
    <main className="mx-auto max-w-[1220px] px-5 py-7 sm:px-8">
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-semibold text-white">Forecast</h1>
        <p className="mt-1 max-w-[640px] text-[13px] text-text-dim">
          Dynamic scenario modeling — Management Case, Live Market Case, and Custom Case.
        </p>
      </div>

      <SectionLabel>Not Yet Built</SectionLabel>
      <div className="rounded-[10px] border border-border bg-panel px-6.5 py-8">
        <div className="max-w-[680px] font-mono text-[12.5px] leading-relaxed text-text-dim">
          <p className="mb-3 text-text">
            This page is a placeholder. The dynamic forecast engine (Layer 3) has not been implemented yet.
          </p>
          <p className="mb-3">
            No forecast values — modeled, guided, or otherwise — are displayed here. Per project instructions, forecast
            outputs must be calculated at runtime from historical data, management guidance, and market inputs, never
            hard-coded.
          </p>
          <p className="mb-1 text-text-faint">When built, this page will support three views:</p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-text-faint">
            <li><span className="text-text-dim">Management Case</span> — driven by company guidance (data/guidance.json).</li>
            <li><span className="text-text-dim">Live Market Case</span> — driven by current market inputs (data/market-data.json) applied to company-specific realization and cost models.</li>
            <li><span className="text-text-dim">Custom Case</span> — user-adjustable assumptions (Henry Hub, WTI, production, capex, unit costs) recalculating downstream outputs live.</li>
          </ul>
          <p>
            Every modeled output will carry an explicit classification (Company Guidance, Model Calculation, Model
            Assumption, or Live / Delayed Market Data) and a traceable formula.
          </p>
        </div>
      </div>
    </main>
  );
}
