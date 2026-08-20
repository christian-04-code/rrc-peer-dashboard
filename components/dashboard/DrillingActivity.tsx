import { getRigDataset, getRigState } from "@/lib/rigs/rig-data";
import { formatPct } from "@/lib/market/macro-analytics";
import { HistoricalLineChart } from "@/components/dashboard/MacroVisuals";

function formatRigCount(value: number | null): string {
  return value === null ? "--" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSignedRigs(value: number | null): string {
  if (value === null) return "--";
  const rounded = Math.round(value);
  return rounded === 0 ? "0" : `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatRigPct(value: number | null): string {
  return value === null ? "--" : formatPct(value * 100);
}

function reportDateLabel(reportDate: string): string {
  const date = new Date(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return reportDate;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function DrillingActivityModule({ stateCode, stateName }: { stateCode: string; stateName: string }) {
  const dataset = getRigDataset();
  const rig = getRigState(stateCode);

  return (
    <section className="drilling-activity" aria-labelledby="drilling-activity-title">
      <div className="macro-map-detail-head"><span id="drilling-activity-title">DRILLING ACTIVITY</span></div>

      {!rig ? (
        <p className="drilling-unsupported">
          Baker Hughes does not separately report {stateName} in its North America Rig Count state breakout
          (report week of {reportDateLabel(dataset.source.reportDate)}). Only {dataset.trackedStateCount} states
          are individually tracked; an untracked state is not the same as a confirmed zero.
        </p>
      ) : (
        <>
          <div className="drilling-headline">
            <div className="drilling-headline-stat"><span>Total Rigs</span><strong>{formatRigCount(rig.current)}</strong></div>
            <div className="drilling-headline-stat"><span>WoW</span><strong className={numTone(rig.wow)}>{formatSignedRigs(rig.wow)}</strong><small>{formatRigPct(rig.wowPct)}</small></div>
            <div className="drilling-headline-stat"><span>YoY</span><strong className={numTone(rig.yoy)}>{formatSignedRigs(rig.yoy)}</strong><small>{formatRigPct(rig.yoyPct)}</small></div>
          </div>

          <div className="drilling-mix">
            <span className="drilling-mix-label">Drilling for (this week)</span>
            <CommodityBar gas={rig.commodityMix.gas} oil={rig.commodityMix.oil} misc={rig.commodityMix.misc} />
            <div className="drilling-mix-legend">
              <span><i className="gas" />Gas · {formatRigCount(rig.commodityMix.gas)}</span>
              <span><i className="oil" />Oil · {formatRigCount(rig.commodityMix.oil)}</span>
              {rig.commodityMix.misc > 0 ? <span><i className="misc" />Misc · {formatRigCount(rig.commodityMix.misc)}</span> : null}
            </div>
          </div>

          {rig.current && (rig.trajectoryMix.horizontal || rig.trajectoryMix.directional || rig.trajectoryMix.vertical) ? (
            <div className="drilling-trajectory">
              <span>Horizontal {formatRigCount(rig.trajectoryMix.horizontal)}</span>
              <span>Directional {formatRigCount(rig.trajectoryMix.directional)}</span>
              <span>Vertical {formatRigCount(rig.trajectoryMix.vertical)}</span>
            </div>
          ) : null}

          <div className="drilling-history">
            <span>{stateName} rig count — last 12 months</span>
            <HistoricalLineChart
              ariaLabel={`${stateName} rig count, last 52 published weeks`}
              unit="rigs"
              limit={52}
              series={[{ id: "rig-count", label: `${stateName} rigs`, color: "#e5ad63", history: rig.history }]}
            />
          </div>

          {rig.topCounties.length ? (
            <div className="drilling-concentration">
              <span>Activity concentration · top counties</span>
              <div className="drilling-concentration-table" role="table" aria-label={`Top drilling counties in ${stateName}`}>
                <div className="drilling-concentration-row header" role="row"><span>County</span><span>Rigs</span><span>Basin</span><span>Drill for</span></div>
                {rig.topCounties.map((county) => (
                  <div className="drilling-concentration-row" role="row" key={county.county}>
                    <span>{county.county}</span>
                    <span>{formatRigCount(county.rigs)}</span>
                    <span>{county.dominantBasin}</span>
                    <span>{county.dominantDrillFor}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <small className="drilling-source">
            Source: Baker Hughes · Week of {reportDateLabel(dataset.source.reportDate)}
          </small>
        </>
      )}
    </section>
  );
}

function numTone(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function CommodityBar({ gas, oil, misc }: { gas: number; oil: number; misc: number }) {
  const total = gas + oil + misc;
  if (total <= 0) return <div className="drilling-commodity-bar empty" aria-hidden="true" />;
  const gasPct = (gas / total) * 100;
  const oilPct = (oil / total) * 100;
  const miscPct = (misc / total) * 100;
  return (
    <div className="drilling-commodity-bar" role="img" aria-label={`${gas} gas rigs, ${oil} oil rigs, ${misc} miscellaneous rigs`}>
      {gasPct > 0 ? <i className="gas" style={{ width: `${gasPct}%` }} /> : null}
      {oilPct > 0 ? <i className="oil" style={{ width: `${oilPct}%` }} /> : null}
      {miscPct > 0 ? <i className="misc" style={{ width: `${miscPct}%` }} /> : null}
    </div>
  );
}
