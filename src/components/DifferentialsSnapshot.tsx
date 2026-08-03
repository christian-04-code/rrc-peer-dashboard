import { formatValue, unitLabel } from "@/lib/metrics";
import { CORE_PEER_ORDER } from "@/lib/constants";
import type { DifferentialClassification, DifferentialNormalizedData, DifferentialValue } from "@/lib/types";

function ClassBadge({ classification }: { classification: DifferentialClassification }) {
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

const CONFIDENCE_COLOR: Record<DifferentialValue["confidence"], string> = {
  high: "var(--pos)",
  medium: "#D9A441",
  low: "var(--neg)",
};

function ConfidenceDot({ confidence }: { confidence: DifferentialValue["confidence"] }) {
  if (confidence === "high") return null;
  return (
    <span
      className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
      style={{ background: CONFIDENCE_COLOR[confidence] }}
      title={`Confidence: ${confidence}`}
    />
  );
}

function NoteIndicator({ note }: { note: string }) {
  return (
    <span
      className="inline-flex h-[13px] w-[13px] shrink-0 cursor-help items-center justify-center rounded-full font-mono text-[9px] font-semibold leading-none"
      style={{ background: "rgba(130,142,156,0.18)", color: "var(--text-dim)" }}
      title={note}
    >
      i
    </span>
  );
}

function DifferentialCell({ value }: { value: DifferentialValue | null }) {
  if (!value) {
    return <span className="font-mono text-[12.5px] text-text-faint">—</span>;
  }
  const low = formatValue(value.low, value.unit, { signed: true });
  const high = formatValue(value.high, value.unit, { signed: true });
  // Space around the dash: for negative–negative ranges (e.g. "-0.45"/"-0.35"), a bare "–"
  // reads as a second minus sign ("-0.45–-0.35" looks like a typo) — spacing disambiguates it.
  const rangeText = value.low === value.high ? low : `${low} – ${high}`;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {value.note && <NoteIndicator note={value.note} />}
        <div className="font-mono text-[13px] text-text">
          {rangeText} <span className="text-[10.5px] font-normal text-text-dim">{unitLabel(value.unit)}</span>
        </div>
      </div>
      <div className="font-mono text-[10px] text-text-faint">{value.benchmark ? `vs. ${value.benchmark}` : "no benchmark stated"}</div>
      <div className="flex items-center gap-1.5">
        <ConfidenceDot confidence={value.confidence} />
        <ClassBadge classification={value.classification} />
      </div>
    </div>
  );
}

function EthaneCallout({ value }: { value: DifferentialValue }) {
  const low = formatValue(value.low, value.unit, { signed: true });
  const high = formatValue(value.high, value.unit, { signed: true });
  const rangeText = value.low === value.high ? low : `${low} – ${high}`;
  return (
    <div
      className="mt-3.5 flex flex-col gap-1.5 rounded-[8px] border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: "rgba(229,85,92,0.4)", background: "rgba(229,85,92,0.06)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="whitespace-nowrap rounded-[3px] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold tracking-[0.04em] uppercase"
          style={{ background: "rgba(229,85,92,0.16)", color: "var(--neg)" }}
        >
          Needs Verification
        </span>
        <span className="font-mono text-[11.5px] text-text-dim">
          AR — Ethane Differential:{" "}
          <span className="text-text">
            {rangeText} {unitLabel(value.unit)}
          </span>{" "}
          {value.benchmark && <span className="text-text-faint">vs. {value.benchmark}</span>}
        </span>
      </div>
      <div className="flex max-w-[420px] items-start gap-1.5 sm:justify-end">
        <span className="mt-[1px]"><NoteIndicator note={value.note ?? ""} /></span>
        <span className="font-mono text-[9.5px] leading-snug text-text-faint">
          Self-flagged by AR as requiring direct company-source verification — not used for Layer 3 forecasting yet.
        </span>
      </div>
    </div>
  );
}

export function DifferentialsSnapshot({ differentials }: { differentials: DifferentialNormalizedData }) {
  const tickers = CORE_PEER_ORDER.filter((ticker) => differentials[ticker]);
  const arEthane = differentials.AR?.ethane_differential;

  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-3.5">
        <h3 className="text-[14.5px] font-semibold text-white">Pricing Differentials Snapshot</h3>
        <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">
          Source: data/differentials_normalized.json (Layer 2). Only RRC, AR, and CNX disclose differentials vs. a
          named benchmark — CRK, EQT, and EXE have no differential disclosure, and GPOR discloses absolute price
          assumptions rather than a differential, so none of the four appear below.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Company
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Natural Gas Differential
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                NGL Differential
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                Oil / Condensate Differential
              </th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => {
              const peer = differentials[ticker];
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
                    <DifferentialCell value={peer.natural_gas_differential} />
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <DifferentialCell value={peer.ngl_differential} />
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <DifferentialCell value={peer.oil_condensate_differential} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {arEthane && <EthaneCallout value={arEthane} />}
      <div className="mt-3.5 space-y-1 font-mono text-[10px] text-text-faint">
        <div>
          Positive values are a premium to the named benchmark; negative values are a discount. Dashes indicate no
          differential disclosed for that commodity — never estimated.
        </div>
        <div>
          <span className="inline-block h-[6px] w-[6px] rounded-full align-middle" style={{ background: "#D9A441" }} /> = medium
          confidence, <span className="inline-block h-[6px] w-[6px] rounded-full align-middle" style={{ background: "var(--neg)" }} /> =
          low confidence. No dot shown for high confidence. Hover the <span className="text-text-dim">i</span> indicator on any
          field for its full caveat.
        </div>
      </div>
    </div>
  );
}
