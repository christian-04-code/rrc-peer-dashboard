"use client";

import { useMemo, useState } from "react";
import { getRankedRigBasins, getRigDataset } from "@/lib/rigs/rig-data";
import { formatPct } from "@/lib/market/macro-analytics";
import { getStateName } from "@/lib/market/storage-regions";
import { HistoricalLineChart } from "@/components/dashboard/MacroVisuals";
import type { RigBasinDetail } from "@/lib/rigs/types";

type SortKey = "current" | "wow" | "yoy" | "gas" | "oil";
type CommodityView = "all" | "gas" | "oil";
type SortDirection = "asc" | "desc";

const DEFAULT_BASIN_COUNT = 8;

function formatCount(value: number | null): string {
  return value === null ? "--" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSignedCount(value: number | null): string {
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

/**
 * The "Rigs" column (sortKey "current") displays total/gas/oil depending on
 * commodityView, so its sort value follows the same displayed number -- this
 * is what makes selecting Gas/Oil actually re-rank the table by that
 * commodity when the user hasn't explicitly chosen a different sort column.
 * The dedicated Gas/Oil column sort keys are commodityView-independent: they
 * always sort by that commodity regardless of which view is active.
 */
function sortValue(basin: RigBasinDetail, key: SortKey, commodityView: CommodityView): number | null {
  if (key === "current") {
    if (commodityView === "gas") return basin.commodityMix.gas;
    if (commodityView === "oil") return basin.commodityMix.oil;
    return basin.current;
  }
  if (key === "wow") return basin.wow;
  if (key === "yoy") return basin.yoy;
  if (key === "gas") return basin.commodityMix.gas;
  return basin.commodityMix.oil;
}

function toneClass(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

export function BasinRigActivity() {
  const allRanked = useMemo(() => getRankedRigBasins(), []);
  const reportDate = getRigDataset().source.reportDate;
  const [showAll, setShowAll] = useState(false);
  const [commodityView, setCommodityView] = useState<CommodityView>("all");
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedBasin, setSelectedBasin] = useState(allRanked[0]?.basin ?? "");

  const sortedBasins = useMemo(() => {
    return [...allRanked].sort((left, right) => {
      const leftValue = sortValue(left, sortKey, commodityView);
      const rightValue = sortValue(right, sortKey, commodityView);
      // A missing (null) value is not a meaningful zero -- always push it to the
      // bottom of the ranking regardless of sort direction, rather than letting
      // it win an ascending sort or lose ties it shouldn't.
      if (leftValue === null && rightValue === null) return left.basin.localeCompare(right.basin);
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const primary = sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
      // Deterministic secondary sort so tied basins (e.g. several at 0 WoW) never
      // reorder from an unrelated state change.
      return primary !== 0 ? primary : left.basin.localeCompare(right.basin);
    });
  }, [allRanked, sortDirection, sortKey, commodityView]);

  const visibleBasins = useMemo(
    () => (showAll ? sortedBasins : sortedBasins.slice(0, DEFAULT_BASIN_COUNT)),
    [sortedBasins, showAll]
  );

  const selected = allRanked.find((basin) => basin.basin === selectedBasin) ?? null;
  const selectedIsHidden = selected !== null && !showAll && !visibleBasins.some((basin) => basin.basin === selected.basin);

  // Unavailable (null) WoW is never treated as a zero-change basin -- it is simply
  // excluded from both lists rather than silently competing as a "gainer" or
  // "decliner". Ties break on basin name so the list never reorders on an
  // unrelated re-render.
  const gainers = useMemo(() => [...allRanked]
    .filter((basin): basin is RigBasinDetail & { wow: number } => basin.wow !== null && basin.wow > 0)
    .sort((left, right) => right.wow - left.wow || left.basin.localeCompare(right.basin))
    .slice(0, 3), [allRanked]);
  const decliners = useMemo(() => [...allRanked]
    .filter((basin): basin is RigBasinDetail & { wow: number } => basin.wow !== null && basin.wow < 0)
    .sort((left, right) => left.wow - right.wow || left.basin.localeCompare(right.basin))
    .slice(0, 3), [allRanked]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  }

  function selectBasin(basin: string) {
    setSelectedBasin(basin);
  }

  if (allRanked.length === 0) return null;

  return (
    <section className="basin-activity" aria-labelledby="basin-activity-title">
      <div className="macro-card-title">
        <div>
          <h3 id="basin-activity-title">Major Basin Rig Activity</h3>
          <span>Baker Hughes weekly drilling activity by major U.S. basin · week of {reportDateLabel(reportDate)}</span>
        </div>
        <div className="macro-map-controls">
          <div className="macro-segmented" aria-label="Commodity view">
            <button aria-pressed={commodityView === "all"} className={commodityView === "all" ? "active" : ""} onClick={() => setCommodityView("all")}>All rigs</button>
            <button aria-pressed={commodityView === "gas"} className={commodityView === "gas" ? "active" : ""} onClick={() => setCommodityView("gas")}>Gas</button>
            <button aria-pressed={commodityView === "oil"} className={commodityView === "oil" ? "active" : ""} onClick={() => setCommodityView("oil")}>Oil</button>
          </div>
          <label className="basin-jump">
            <span>Jump to basin</span>
            <select value={selectedBasin} onChange={(event) => selectBasin(event.target.value)}>
              {allRanked.map((basin) => <option key={basin.basin} value={basin.basin}>{basin.basin}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="basin-activity-grid">
        <div className="basin-ranking-wrap">
          <div className="basin-ranking-table" role="table" aria-label="Basin rig activity ranking">
            <div className="basin-ranking-row header" role="row">
              <span>Basin</span>
              <button type="button" className={sortKey === "current" ? "active" : ""} onClick={() => toggleSort("current")}>
                {commodityView === "gas" ? "Gas rigs" : commodityView === "oil" ? "Oil rigs" : "Rigs"} {sortKey === "current" ? (sortDirection === "desc" ? "↓" : "↑") : ""}
              </button>
              <button type="button" className={sortKey === "wow" ? "active" : ""} onClick={() => toggleSort("wow")} title={commodityView !== "all" ? "WoW reflects total rig count change; Baker Hughes does not publish a gas- or oil-specific weekly change." : undefined}>WoW {sortKey === "wow" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
              <button type="button" className={sortKey === "yoy" ? "active" : ""} onClick={() => toggleSort("yoy")} title={commodityView !== "all" ? "YoY reflects total rig count change; Baker Hughes does not publish a gas- or oil-specific year-over-year change." : undefined}>YoY {sortKey === "yoy" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
              <button type="button" className={sortKey === "gas" ? "active" : ""} onClick={() => toggleSort("gas")}>Gas {sortKey === "gas" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
              <button type="button" className={sortKey === "oil" ? "active" : ""} onClick={() => toggleSort("oil")}>Oil {sortKey === "oil" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
            </div>
            {visibleBasins.map((basin) => {
              const displayCurrent = commodityView === "gas" ? basin.commodityMix.gas : commodityView === "oil" ? basin.commodityMix.oil : basin.current;
              const isSelected = basin.basin === selectedBasin;
              return (
                <button
                  type="button"
                  key={basin.basin}
                  className={isSelected ? "basin-ranking-row selected" : "basin-ranking-row"}
                  role="row"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => selectBasin(basin.basin)}
                >
                  <span className="basin-name">{basin.basin}</span>
                  <span className="basin-num">{formatCount(displayCurrent)}</span>
                  <span className={`basin-num ${toneClass(basin.wow)}`}>{formatSignedCount(basin.wow)}</span>
                  <span className={`basin-num ${toneClass(basin.yoy)}`}>{formatSignedCount(basin.yoy)}</span>
                  <span className="basin-num">{formatCount(basin.commodityMix.gas)}</span>
                  <span className="basin-num">{formatCount(basin.commodityMix.oil)}</span>
                </button>
              );
            })}
          </div>
          {commodityView !== "all" ? (
            <small className="basin-caveat">WoW and YoY reflect total rig count change; Baker Hughes does not publish a gas- or oil-specific weekly/annual change.</small>
          ) : null}
          {selectedIsHidden && selected ? (
            <small className="basin-caveat">Selected basin ({selected.basin}) is outside the top {DEFAULT_BASIN_COUNT} shown -- <button type="button" className="basin-show-all-inline" onClick={() => setShowAll(true)}>show all {allRanked.length} basins</button> to see its row.</small>
          ) : null}
          {allRanked.length > DEFAULT_BASIN_COUNT ? (
            <button type="button" className="basin-show-all" onClick={() => setShowAll((current) => !current)}>
              {showAll ? `Show top ${DEFAULT_BASIN_COUNT}` : `Show all ${allRanked.length} basins`}
            </button>
          ) : null}

          {gainers.length || decliners.length ? (
            <div className="basin-variance">
              {gainers.length ? (
                <div>
                  <span>Largest WoW gainers</span>
                  {gainers.map((basin) => <div key={basin.basin} className="basin-variance-row"><b>{basin.basin}</b><em className="positive">{formatSignedCount(basin.wow)}</em></div>)}
                </div>
              ) : null}
              {decliners.length ? (
                <div>
                  <span>Largest WoW decliners</span>
                  {decliners.map((basin) => <div key={basin.basin} className="basin-variance-row"><b>{basin.basin}</b><em className="negative">{formatSignedCount(basin.wow)}</em></div>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {selected ? (
          <aside className="basin-detail">
            <h4>{selected.basin}</h4>
            <div className="drilling-headline">
              <div className="drilling-headline-stat"><span>Total Rigs</span><strong>{formatCount(selected.current)}</strong></div>
              <div className="drilling-headline-stat"><span>WoW</span><strong className={toneClass(selected.wow)}>{formatSignedCount(selected.wow)}</strong><small>{formatRigPct(selected.wowPct)}</small></div>
              <div className="drilling-headline-stat"><span>YoY</span><strong className={toneClass(selected.yoy)}>{formatSignedCount(selected.yoy)}</strong><small>{formatRigPct(selected.yoyPct)}</small></div>
            </div>

            <div className="basin-detail-row">
              <span>Gas</span><b>{formatCount(selected.commodityMix.gas)}</b>
              <span>Oil</span><b>{formatCount(selected.commodityMix.oil)}</b>
              {selected.commodityMix.misc > 0 ? <><span>Misc</span><b>{formatCount(selected.commodityMix.misc)}</b></> : null}
            </div>

            {selected.current && (selected.trajectoryMix.horizontal || selected.trajectoryMix.directional || selected.trajectoryMix.vertical) ? (
              <div className="drilling-trajectory">
                <span>Horizontal {formatCount(selected.trajectoryMix.horizontal)}</span>
                <span>Directional {formatCount(selected.trajectoryMix.directional)}</span>
                <span>Vertical {formatCount(selected.trajectoryMix.vertical)}</span>
              </div>
            ) : null}

            {selected.states.length ? (
              <div className="basin-footprint">
                <span>Geographic footprint</span>
                <div className="basin-footprint-list">
                  {selected.states.map((state) => <span key={state.code} title={getStateName(state.code) ?? state.code}>{state.code} · {formatCount(state.current)}</span>)}
                </div>
              </div>
            ) : null}

            <div className="drilling-history">
              <span>{selected.basin} rig count — last 12 months</span>
              <HistoricalLineChart
                ariaLabel={`${selected.basin} rig count, last 52 published weeks`}
                unit="rigs"
                limit={52}
                series={[{ id: "basin-rig-count", label: `${selected.basin} rigs`, color: "#70c99a", history: selected.history }]}
              />
            </div>

            {selected.topLocations.length ? (
              <div className="drilling-concentration">
                <span>Activity concentration · top locations</span>
                <div className="drilling-concentration-table" role="table" aria-label={`Top drilling locations in ${selected.basin}`}>
                  <div className="drilling-concentration-row header" role="row"><span>County</span><span>Rigs</span><span>State</span></div>
                  {selected.topLocations.map((location) => (
                    <div className="drilling-concentration-row" role="row" key={`${location.state}-${location.county}`}>
                      <span>{location.county}</span>
                      <span>{formatCount(location.rigs)}</span>
                      <span>{location.state}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <small className="drilling-source">Source: Baker Hughes · Week of {reportDateLabel(reportDate)}</small>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
