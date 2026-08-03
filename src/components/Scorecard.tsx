import { Badge } from "./Badge";
import { formatValue, unitLabel } from "@/lib/metrics";
import { NEUTRAL_COLOR, PEER_COLORS } from "@/lib/constants";
import type { ScorecardCardData } from "@/lib/overview";

function DeltaLine({ card }: { card: ScorecardCardData }) {
  if (card.deltaVsMedianPct === null) {
    return <div className="mb-3.5 font-mono text-[11.5px] font-medium text-text-faint">— no peer median available</div>;
  }
  const isGood = card.higherIsBetter ? card.deltaVsMedianPct >= 0 : card.deltaVsMedianPct <= 0;
  const arrow = card.deltaVsMedianPct >= 0 ? "▲" : "▼";
  return (
    <div className="mb-3.5 font-mono text-[11.5px] font-medium" style={{ color: isGood ? "var(--pos)" : "var(--neg)" }}>
      {arrow} {card.deltaVsMedianPct >= 0 ? "+" : ""}
      {card.deltaVsMedianPct.toFixed(0)}% vs. peer median
    </div>
  );
}

function MiniBars({ card }: { card: ScorecardCardData }) {
  const magnitudes = card.rows.map((r) => Math.abs(r.value ?? 0));
  const max = Math.max(...magnitudes, 1e-9);

  return (
    <div className="flex flex-col gap-[5px]">
      {card.rows.map((row) => {
        const width = row.value === null ? 0 : Math.max((Math.abs(row.value) / max) * 100, row.value === 0 ? 0 : 3);
        const barColor = row.isRRC ? "var(--blue)" : row.isMedian ? NEUTRAL_COLOR : (PEER_COLORS[row.ticker] ?? NEUTRAL_COLOR);
        return (
          <div key={row.ticker} className="grid grid-cols-[34px_1fr_52px] items-center gap-2" style={{ gridTemplateColumns: "34px 1fr 52px" }}>
            <span
              className="truncate font-mono text-[10.5px]"
              style={{ color: row.isRRC ? "var(--blue-soft)" : "var(--text-faint)", fontWeight: row.isRRC ? 700 : 400 }}
            >
              {row.isMedian ? "median" : row.ticker}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#1B222C" }}>
              <div className="h-full rounded-full" style={{ width: `${width}%`, background: barColor }} />
            </div>
            <span
              className="text-right font-mono text-[10.5px]"
              style={{ color: row.isRRC ? "var(--text)" : "var(--text-faint)", fontWeight: row.isRRC ? 600 : 400 }}
            >
              {formatValue(row.value, card.unit)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScorecardCard({ card }: { card: ScorecardCardData }) {
  return (
    <div className="rounded-[10px] border border-border bg-panel p-4.5 pb-4">
      <div className="mb-2.5 flex items-start justify-between">
        <div className="text-[12.5px] font-semibold text-text-dim">{card.name}</div>
        <Badge classification={card.classification} />
      </div>
      <div className="mb-0.5 flex items-baseline gap-1.5 font-mono text-[27px] font-semibold tracking-[-0.01em] text-white">
        {formatValue(card.rrcValue, card.unit, { signed: card.name.includes("Growth") })}
        <span className="text-[12.5px] font-normal text-text-dim">{unitLabel(card.unit)}</span>
      </div>
      <DeltaLine card={card} />
      <MiniBars card={card} />
      {card.reportedOrCalculated === "calculated" && (
        <div className="mt-2.5 font-mono text-[9.5px] text-text-faint">Calculated metric — see Sources for formula</div>
      )}
    </div>
  );
}

export function Scorecard({ cards }: { cards: ScorecardCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <ScorecardCard key={card.name} card={card} />
      ))}
    </div>
  );
}
