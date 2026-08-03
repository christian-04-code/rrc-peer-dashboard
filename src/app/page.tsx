import { MarketBackdrop } from "@/components/MarketBackdrop";
import { PeerScatter } from "@/components/PeerScatter";
import { RankedBarChart } from "@/components/RankedBarChart";
import { RankingTable } from "@/components/RankingTable";
import { Scorecard } from "@/components/Scorecard";
import { SectionLabel } from "@/components/SectionLabel";
import { TrendChart } from "@/components/TrendChart";
import { buildOverviewData } from "@/lib/overview";

export default function OverviewPage() {
  const data = buildOverviewData();

  return (
    <main className="mx-auto max-w-[1220px] px-5 py-7 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-white">Overview</h1>
          <p className="mt-1 max-w-[640px] text-[13px] text-text-dim">
            Range Resources (RRC) versus its core natural gas peer group — {data.corePeers.join(", ")}. RRC is the fixed
            benchmark across every view. All figures below are Company-Reported Historical actuals as of {data.asOfQuarter}
            unless otherwise labeled.
          </p>
        </div>
      </div>

      <SectionLabel>Market Backdrop — Live / Delayed</SectionLabel>
      <MarketBackdrop tiles={data.backdropTiles} />

      <SectionLabel>RRC Scorecard — {data.asOfQuarter}</SectionLabel>
      <Scorecard cards={data.scorecard} />

      <SectionLabel>Peer Ranking — Adjusted EBITDAX ({data.asOfQuarter})</SectionLabel>
      <RankedBarChart
        bars={data.ebitdaxBars}
        median={data.ebitdaxBarMedian}
        unit="$mm"
        title="Adjusted EBITDAX by Company"
        subtitle={`${data.asOfQuarter} · Company-Reported Historical (Actual)`}
      />

      <SectionLabel>Historical Trend — Adjusted EBITDAX</SectionLabel>
      <TrendChart
        series={data.trendSeries}
        quarters={data.trendQuarters}
        unit="$mm"
        title="Adjusted EBITDAX, Q1 2024 – Q1 2026"
        subtitle="Standalone quarterly · Company-Reported Historical (Actual) only — no forecast periods shown"
      />

      <SectionLabel>Peer Positioning — Leverage vs. FCF Yield ({data.asOfQuarter})</SectionLabel>
      <PeerScatter
        points={data.scatter}
        xUnit="x"
        yUnit="%"
        xLabel="Net Debt / LTM EBITDAX"
        yLabel="FCF Yield"
        title="Leverage vs. Free Cash Flow Yield"
        subtitle={`${data.asOfQuarter} · Calculated — Normalized metrics`}
      />

      <SectionLabel>Peer Ranking Table</SectionLabel>
      <RankingTable
        rows={data.rankingTable}
        title="Core Peer Ranking"
        subtitle={`${data.asOfQuarter} · Company-Reported Historical (Actual) and Calculated Normalized metrics`}
      />

      <div className="mt-9 mb-4 font-mono text-[10.5px] text-text-faint">
        All values trace to <code>data/historical.json</code>. Null values indicate the metric was not disclosed for that
        company/quarter — they are never estimated, interpolated, or treated as zero.
      </div>
    </main>
  );
}
