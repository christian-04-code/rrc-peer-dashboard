"use client";

import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesAtlas from "us-atlas/states-albers-10m.json";
import type { MacroFundamentalsResponse, StorageRegionId } from "@/lib/market/macro-types";
import { formatPct } from "@/lib/market/macro-analytics";
import { getStateCode, getStateName, getStorageRegionForState } from "@/lib/market/storage-regions";
import { HistoricalLineChart } from "@/components/dashboard/MacroVisuals";
import { getRigDataset, getRigState, getRigStateMax } from "@/lib/rigs/rig-data";
import { DrillingActivityModule } from "@/components/dashboard/DrillingActivity";

type Position = [number, number];
type StateGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };
type StateFeature = { properties?: { name?: string }; geometry: StateGeometry };
type MapMode = "storage" | "production";
type ProductionView = "current" | "yoy";

const topology = statesAtlas as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
const stateFeatures = (feature(topology, topology.objects.states) as unknown as { features: StateFeature[] }).features;
const MAP_STATES = stateFeatures.flatMap((state) => {
  const name = state.properties?.name ?? "";
  const code = getStateCode(name);
  return code ? [{ code, name, path: geometryPath(state.geometry), centroid: geometryCentroid(state.geometry) }] : [];
});

function geometryPath(geometry: StateGeometry): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map((ring) =>
    ring.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z"
  ).join(" ")).join(" ");
}

/** Bounding-box center of the geometry's largest ring, used to anchor the compact rig-count label. */
function geometryCentroid(geometry: StateGeometry): Position {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let outerRing = polygons[0][0];
  for (const polygon of polygons) {
    if (polygon[0].length > outerRing.length) outerRing = polygon[0];
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outerRing) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function storageColor(value: number | null): string {
  if (value === null) return "#26384b";
  if (value <= -10) return "#0c87bb";
  if (value <= -5) return "#36a4c8";
  if (value < 5) return "#65788c";
  if (value < 10) return "#b18758";
  return "#cf704f";
}

function productionColor(value: number | null, max: number): string {
  if (value === null || max <= 0) return "#26384b";
  const ratio = Math.sqrt(value / max);
  if (ratio >= .8) return "#0079b5";
  if (ratio >= .55) return "#148ec3";
  if (ratio >= .32) return "#35a3cb";
  if (ratio >= .15) return "#5c91a9";
  return "#506779";
}

function productionChangeColor(value: number | null): string {
  if (value === null) return "#26384b";
  if (value <= -10) return "#b94f5f";
  if (value < -2) return "#9a6873";
  if (value <= 2) return "#65788c";
  if (value < 10) return "#4b9b85";
  return "#2ab87d";
}

function formatNumber(value: number | null): string {
  return value === null ? "--" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSigned(value: number | null, unit: string): string {
  return value === null ? "--" : `${value >= 0 ? "+" : "−"}${formatNumber(Math.abs(value))} ${unit}`;
}

function regionFor(data: MacroFundamentalsResponse | null, stateCode: string) {
  const regionId = getStorageRegionForState(stateCode);
  return regionId ? data?.storage.regions[regionId] ?? null : null;
}

export function MacroEnergyMap({ data }: { data: MacroFundamentalsResponse | null }) {
  const [mode, setMode] = useState<MapMode>("storage");
  const [productionView, setProductionView] = useState<ProductionView>("current");
  const [rigOverlay, setRigOverlay] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState("PA");
  const productionMax = useMemo(() => Math.max(0, ...Object.values(data?.production.states ?? {}).map((state) => state.current)), [data]);
  const rigMax = useMemo(() => getRigStateMax(), []);
  const activeState = hovered ?? selected;
  const stateName = getStateName(activeState) ?? activeState;
  const region = regionFor(data, activeState);
  const production = data?.production.states[activeState] ?? null;
  const activeRig = getRigState(activeState);
  const selectedRegion = regionFor(data, selected);
  const selectedProduction = data?.production.states[selected] ?? null;
  const selectedName = getStateName(selected) ?? selected;
  const rigReportDate = getRigDataset().source.reportDate;

  return (
    <div className="macro-map-layout">
      <div className="macro-map-card">
        <div className="macro-card-title">
          <div><h3>Interactive U.S. energy map</h3><span>{mode === "storage" ? "EIA weekly storage region · deviation from 5-year average" : `EIA monthly marketed production · ${productionView === "current" ? "current state volume" : "year-over-year change"}`}</span></div>
          <div className="macro-map-controls">
            <div className="macro-segmented" aria-label="Map metric">
              <button className={mode === "storage" ? "active" : ""} onClick={() => setMode("storage")}>Storage</button>
              <button className={mode === "production" ? "active" : ""} onClick={() => setMode("production")}>Production</button>
            </div>
            {mode === "production" ? <div className="macro-segmented secondary" aria-label="Production map view"><button className={productionView === "current" ? "active" : ""} onClick={() => setProductionView("current")}>Current</button><button className={productionView === "yoy" ? "active" : ""} onClick={() => setProductionView("yoy")}>YoY change</button></div> : null}
            <button
              type="button"
              className={rigOverlay ? "macro-rig-toggle active" : "macro-rig-toggle"}
              aria-pressed={rigOverlay}
              onClick={() => setRigOverlay((current) => !current)}
            >
              <i /> Rig activity overlay
            </button>
          </div>
        </div>
        <div className="macro-us-map" onMouseLeave={() => setHovered(null)}>
          <svg viewBox="0 0 975 610" role="img" aria-label={`United States ${mode} choropleth`}>
            {MAP_STATES.map((state) => {
              const stateRegion = regionFor(data, state.code);
              const stateProduction = data?.production.states[state.code] ?? null;
              const value = mode === "storage" ? stateRegion?.fiveYearPct ?? null : productionView === "current" ? stateProduction?.current ?? null : stateProduction?.yearOverYearPct ?? null;
              const fill = mode === "storage" ? storageColor(value) : productionView === "current" ? productionColor(value, productionMax) : productionChangeColor(value);
              return (
                <path
                  key={state.code}
                  d={state.path}
                  fill={fill}
                  className={selected === state.code ? "macro-map-state selected" : "macro-map-state"}
                  tabIndex={0}
                  role="button"
                  aria-label={`${state.name}: ${value === null ? "unavailable" : mode === "storage" ? `${formatPct(value)} versus five-year regional average` : productionView === "current" ? `${formatNumber(value)} MMcf per month` : `${formatPct(value)} year over year`}`}
                  onMouseEnter={() => setHovered(state.code)}
                  onFocus={() => setHovered(state.code)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setSelected(state.code)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(state.code);
                    }
                  }}
                />
              );
            })}
            {rigOverlay ? MAP_STATES.flatMap((state) => {
              const rig = getRigState(state.code);
              if (!rig || !rig.current) return [];
              const radius = 6 + Math.sqrt(rig.current / (rigMax || 1)) * 7;
              return [
                <g key={`rig-${state.code}`} className="macro-rig-label" pointerEvents="none">
                  <circle cx={state.centroid[0]} cy={state.centroid[1]} r={radius} />
                  <text x={state.centroid[0]} y={state.centroid[1]}>{formatNumber(rig.current)}</text>
                </g>
              ];
            }) : null}
          </svg>
          <div className="macro-map-tooltip" aria-live="polite">
            <strong>{stateName}</strong>
            {mode === "storage" ? (
              <><span>{region?.label ?? "No EIA storage region"}</span><b>{formatNumber(region?.current ?? null)} Bcf</b><small>{formatSigned(region?.weeklyChange ?? null, "Bcf")} weekly · {formatPct(region?.fiveYearPct ?? null)} vs 5Y · {region?.period ?? "--"}</small></>
            ) : (
              <><span>Marketed gas production</span><b>{productionView === "current" ? `${formatNumber(production?.current ?? null)} MMcf/mo` : `${formatPct(production?.yearOverYearPct ?? null)} YoY`}</b><small>{formatPct(production?.monthOverMonthPct ?? null)} MoM · {formatPct(production?.yearOverYearPct ?? null)} YoY · {production?.period ?? "--"}</small></>
            )}
            {rigOverlay && activeRig ? (
              <div className="macro-map-tooltip-rigs">
                <span>Baker Hughes rigs</span>
                <b>{formatNumber(activeRig.current)} total</b>
                <small>{formatSigned(activeRig.wow, "WoW")} · {formatSigned(activeRig.yoy, "YoY")} · Gas {formatNumber(activeRig.commodityMix.gas)} / Oil {formatNumber(activeRig.commodityMix.oil)}</small>
              </div>
            ) : rigOverlay ? <div className="macro-map-tooltip-rigs"><span>Baker Hughes rigs</span><small>Not individually tracked for {stateName}</small></div> : null}
          </div>
        </div>
        <div className="macro-map-legend">
          {mode === "storage" ? (
            <><span><i style={{ background: storageColor(-12) }} />≤−10%</span><span><i style={{ background: storageColor(-7) }} />−10% to −5%</span><span><i style={{ background: storageColor(0) }} />Near avg</span><span><i style={{ background: storageColor(7) }} />+5% to +10%</span><span><i style={{ background: storageColor(12) }} />≥+10%</span><small>EIA weekly storage region—not independent state storage.</small></>
          ) : (
            productionView === "current"
              ? <><span><i style={{ background: "#506779" }} />Lower</span><span><i style={{ background: "#35a3cb" }} />Mid</span><span><i style={{ background: "#0079b5" }} />Highest</span><small>Relative state-volume scale; unavailable states are gray.</small></>
              : <><span><i style={{ background: productionChangeColor(-12) }} />≤−10%</span><span><i style={{ background: productionChangeColor(-5) }} />Declining</span><span><i style={{ background: productionChangeColor(0) }} />Near flat</span><span><i style={{ background: productionChangeColor(5) }} />Growing</span><span><i style={{ background: productionChangeColor(12) }} />≥+10%</span></>
          )}
          {rigOverlay ? <span className="macro-rig-legend-note"><i className="macro-rig-legend-dot" />Rig count · Baker Hughes, week of {rigReportDate}</span> : null}
        </div>
      </div>

      <aside className="macro-map-detail">
        <div className="macro-map-detail-head"><span>SELECTED GEOGRAPHY</span><button onClick={() => setSelected("PA")}>Reset to PA</button></div>
        <h3>{selectedName}</h3>
        {mode === "storage" ? (
          <>
            <p>EIA reports weekly storage for the <strong>{selectedRegion?.label ?? "unavailable"}</strong> region—not separately for {selectedName}.</p>
            <dl>
              <div><dt>Regional working gas</dt><dd>{formatNumber(selectedRegion?.current ?? null)} Bcf</dd></div>
              <div><dt>Weekly change</dt><dd>{formatNumber(selectedRegion?.weeklyChange ?? null)} Bcf</dd></div>
              <div><dt>vs year ago</dt><dd>{formatPct(selectedRegion?.yearAgoPct ?? null)}</dd></div>
              <div><dt>vs 5-year average</dt><dd>{formatPct(selectedRegion?.fiveYearPct ?? null)}</dd></div>
              <div><dt>Observation week</dt><dd>{selectedRegion?.period ?? "--"}</dd></div>
            </dl>
            <div className="macro-map-history"><span>Regional storage history</span><HistoricalLineChart ariaLabel={`${selectedRegion?.label ?? selectedName} regional storage history`} unit="Bcf" limit={104} series={[{ id: "selected-storage", label: selectedRegion?.label ?? "Regional storage", color: "#3db3e3", history: selectedRegion?.history ?? [] }]} /></div>
          </>
        ) : (
          <>
            <p>Source: U.S. EIA</p>
            <dl>
              <div><dt>Latest production</dt><dd>{formatNumber(selectedProduction?.current ?? null)} MMcf</dd></div>
              <div><dt>Month over month</dt><dd>{formatPct(selectedProduction?.monthOverMonthPct ?? null)}</dd></div>
              <div><dt>Year over year</dt><dd>{formatPct(selectedProduction?.yearOverYearPct ?? null)}</dd></div>
              <div><dt>Observation month</dt><dd>{selectedProduction?.period ?? "--"}</dd></div>
            </dl>
            <div className="macro-map-history"><span>State production history</span><HistoricalLineChart ariaLabel={`${selectedName} marketed production history`} unit="MMcf/month" limit={36} series={[{ id: "selected-production", label: selectedName, color: "#70c99a", history: selectedProduction?.history ?? [] }]} /></div>
          </>
        )}
        {selected === "PA" ? <div className="macro-pa-callout"><strong>RRC relevance</strong><span>Pennsylvania is RRC&apos;s core Marcellus operating state.</span></div> : null}
        <small>Source: U.S. EIA · retrieved {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "--"}</small>
        <DrillingActivityModule stateCode={selected} stateName={selectedName} />
      </aside>
    </div>
  );
}
