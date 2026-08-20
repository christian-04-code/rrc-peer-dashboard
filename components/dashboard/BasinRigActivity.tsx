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

function sortValue(basin: RigBasinDetail, key: SortKey): number {
  if (key === "current") return basin.current ?? 0;
  if (key === "wow") return basin.wow ?? 0;
  if (key === "yoy") return basin.yoy ?? 0;
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

  const visibleBasins = useMemo(() => {
    const sorted = [...allRanked].sort((left, right) =>
      sortDirection === "desc" ? sortValue(right, sortKey) - sortValue(left, sortKey) : sortValue(left, sortKey) - sortValue(right, sortKey)
    );
    return showAll ? sorted : sorted.slice(0, DEFAULT_BASIN_COUNT);
  }, [allRanked, showAll, sortDirection, sortKey]);

  const selected = allRanked.find((basin) => basin.basin === selectedBasin) ?? null;

  const gainers = useMemo(() => [...allRanked].filter((basin) => (basin.wow ?? 0) > 0).sort((left, right) => (right.wow ?? 0) - (left.wow ?? 0)).slice(0, 3), [allRanked]);
  const decliners = useMemo(() => [...allRanked].filter((basin) => (basin.wow ?? 0) < 0).sort((left, right) => (left.wow ?? 0) - (right.wow ?? 0)).slice(0, 3), [allRanked]);

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
            <button className={commodityView === "all" ? "active" : ""} onClick={() => setCommodityView("all")}>All rigs</button>
            <button className={commodityView === "gas" ? "active" : ""} onClick={() => setCommodityView("gas")}>Gas</button>
            <button className={commodityView === "oil" ? "active" : ""} onClick={() => setCommodityView("oil")}>Oil</button>
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
              <button type="button" className={sortKey === "wow" ? "active" : ""} onClick={() => toggleSort("wow")}>WoW {sortKey === "wow" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
              <button type="button" className={sortKey === "yoy" ? "active" : ""} onClick={() => toggleSort("yoy")}>YoY {sortKey === "yoy" ? (sortDirection === "desc" ? "↓" : "↑") : ""}</button>
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
