import { formatValue, unitLabel } from "@/lib/metrics";
import { CORE_PEER_ORDER } from "@/lib/constants";
import type { GuidanceNormalizedData, GuidanceNormalizedPeer, GuidancePointValue, GuidanceRangeValue } from "@/lib/types";

function ClassBadge({ classification }: { classification: "company_guidance" | "model_calculation" }) {
  const isCalc = classification === "model_calculation";
  return (
    <span
      className="whitespace-nowrap rounded-[3px] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold tracking-[0.04em] uppercase"
      style={{
        background: isCalc ? "rgba(154,110,220,0.14)" : "var(--blue-wash)",
        color: isCalc ? "#B79CE8" : "var(--blue-soft)",
      }}
    >
      {isCalc ? "Model Calc" : "Company Guidance"}
    </span>
  );
}

function RangeCell({ value, unit }: { value: GuidanceRangeValue | null; unit: string }) {
  if (!value) {
    return <span className="font-mono text-[12.5px] text-text-faint">—</span>;
  }
  const low = formatValue(value.low, unit);
  const high = formatValue(value.high, unit);
  const rangeText = value.low === value.high ? low : `${low}–${high}`;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="font-mono text-[13px] text-text">
        {rangeText} <span className="text-[10.5px] font-normal text-text-dim">{unitLabel(unit)}</span>
      </div>
      <ClassBadge classification={value.classification} />
      {value.partial && (
        <div className="max-w-[160px] text-right font-mono text-[9.5px] leading-snug" style={{ color: "#D9A441" }}>
          ⚠ Partial — {value.note}
        </div>
      )}
    </div>
  );
}

function RRCProductionCell({ peer }: { peer: GuidanceNormalizedPeer }) {
  const target: GuidancePointValue | undefined = peer.production_yearend_target_bcfe_per_day;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-[12.5px] text-text-faint">—</span>
      {target && (
        <div className="max-w-[170px] text-right font-mono text-[9.5px] leading-snug text-text-faint">
          RRC discloses quarterly/exit-rate figures, not a full-year total. Year-end target:{" "}
          <span className="text-text-dim">
            {formatValue(target.value, target.unit ?? "")} {target.unit}
          </span>{" "}
          — not comparable to other peers&apos; full-year average.
        </div>
      )}
    </div>
  );
}

export function GuidanceSnapshot({ guidance }: { guidance: GuidanceNormalizedData }) {
  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-3.5">
        <h3 className="text-[14.5px] font-semibold text-white">2026 Guidance Snapshot — Core Peers</h3>
        <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">
          Source: data/guidance_normalized.json (Layer 2). Company Guidance = direct quote from the company&apos;s own
          disclosure. Model Calc = summed from multiple disclosed components by scripts/normalize-guidance.ts — never a
          company-stated total. This is a guidance display, not a forecast — no EBITDAX, FCF, or derived metric is
          computed here.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Company
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Production (Bcfe/d)
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Capex ($MM)
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Cash Unit Cost ($/Mcfe)
              </th>
            </tr>
          </thead>
          <tbody>
            {CORE_PEER_ORDER.map((ticker) => {
              const peer = guidance[ticker];
              const isRRC = ticker === "RRC";
              if (!peer) return null;
              return (
                <tr
                  key={ticker}
                  className="border-b border-border/60 last:border-b-0"
                  style={isRRC ? { background: "var(--blue-wash)" } : undefined}
                >
                  <td className="px-2 py-2.5 align-top">
                    <span
                      className="font-mono text-[12.5px]"
                      style={{ color: isRRC ? "var(--blue-soft)" : "var(--text)", fontWeight: isRRC ? 700 : 500 }}
                    >
                      {ticker}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    {peer.production_total_bcfe_per_day ? (
                      <RangeCell value={peer.production_total_bcfe_per_day} unit="Bcfe/d" />
                    ) : (
                      <RRCProductionCell peer={peer} />
                    )}
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <RangeCell value={peer.capex_total_mm} unit="$mm" />
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <RangeCell value={peer.cash_unit_cost_total} unit="$/Mcfe" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3.5 space-y-1 font-mono text-[10px] text-text-faint">
        <div>
          Dashes indicate the company does not disclose a single full-year figure for that metric — never estimated
          or zero-filled.
        </div>
        <div>
          ⚠ Partial figures (RRC, CRK cash unit cost) omit at least one real cost component that could not be
          included in the sum (unit mismatch or no absolute figure disclosed) — do not treat as a complete total.
        </div>
      </div>
    </div>
  );
}
