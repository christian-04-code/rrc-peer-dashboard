"use client";

import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import statesAtlas from "us-atlas/states-albers-10m.json";
import type { MacroFundamentalsResponse, StorageRegionId } from "@/lib/market/macro-types";
import { formatPct } from "@/lib/market/macro-analytics";
import { getStateCode, getStateName, getStorageRegionForState } from "@/lib/market/storage-regions";
import { HistoricalLineChart } from "@/components/dashboard/MacroVisuals";

type Position = [number, number];
type StateGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };
type StateFeature = { properties?: { name?: string }; geometry: StateGeometry };
type MapMode = "storage" | "production";

const topology = statesAtlas as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
const stateFeatures = (feature(topology, topology.objects.states) as unknown as { features: StateFeature[] }).features;
const MAP_STATES = stateFeatures.flatMap((state) => {
  const name = state.properties?.name ?? "";
  const code = getStateCode(name);
  return code ? [{ code, name, path: geometryPath(state.geometry) }] : [];
});

function geometryPath(geometry: StateGeometry): string {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map((ring) =>
    ring.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z"
  ).join(" ")).join(" ");
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState("PA");
  const productionMax = useMemo(() => Math.max(0, ...Object.values(data?.production.states ?? {}).map((state) => state.current)), [data]);
  const activeState = hovered ?? selected;
  const stateName = getStateName(activeState) ?? activeState;
  const region = regionFor(data, activeState);
  const production = data?.production.states[activeState] ?? null;
  const selectedRegion = regionFor(data, selected);
  const selectedProduction = data?.production.states[selected] ?? null;
  const selectedName = getStateName(selected) ?? selected;

  return (
    <div className="macro-map-layout">
      <div className="macro-map-card">
        <div className="macro-card-title">
          <div><h3>Interactive U.S. energy map</h3><span>{mode === "storage" ? "EIA weekly storage region · deviation from 5-year average" : "EIA monthly marketed production · state-level"}</span></div>
          <div className="macro-segmented" aria-label="Map metric">
            <button className={mode === "storage" ? "active" : ""} onClick={() => setMode("storage")}>Storage</button>
            <button className={mode === "production" ? "active" : ""} onClick={() => setMode("production")}>Production</button>
          </div>
        </div>
        <div className="macro-us-map" onMouseLeave={() => setHovered(null)}>
          <svg viewBox="0 0 975 610" role="img" aria-label={`United States ${mode} choropleth`}>
            {MAP_STATES.map((state) => {
              const stateRegion = regionFor(data, state.code);
              const stateProduction = data?.production.states[state.code] ?? null;
              const value = mode === "storage" ? stateRegion?.fiveYearPct ?? null : stateProduction?.current ?? null;
              const fill = mode === "storage" ? storageColor(value) : productionColor(value, productionMax);
              return (
                <path
                  key={state.code}
                  d={state.path}
                  fill={fill}
                  className={selected === state.code ? "macro-map-state selected" : "macro-map-state"}
                  tabIndex={0}
                  role="button"
                  aria-label={`${state.name}: ${value === null ? "unavailable" : mode === "storage" ? `${formatPct(value)} versus five-year regional average` : `${formatNumber(value)} MMcf per month`}`}
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
          </svg>
          <div className="macro-map-tooltip" aria-live="polite">
            <strong>{stateName}</strong>
            {mode === "storage" ? (
              <><span>{region?.label ?? "No EIA storage region"}</span><b>{formatNumber(region?.current ?? null)} Bcf</b><small>{formatSigned(region?.weeklyChange ?? null, "Bcf")} weekly · {formatPct(region?.fiveYearPct ?? null)} vs 5Y · {region?.period ?? "--"}</small></>
            ) : (
              <><span>Marketed gas production</span><b>{formatNumber(production?.current ?? null)} MMcf/mo</b><small>{formatPct(production?.monthOverMonthPct ?? null)} MoM · {formatPct(production?.yearOverYearPct ?? null)} YoY · {production?.period ?? "--"}</small></>
            )}
          </div>
        </div>
        <div className="macro-map-legend">
          {mode === "storage" ? (
            <><span><i style={{ background: storageColor(-12) }} />≤−10%</span><span><i style={{ background: storageColor(-7) }} />−10% to −5%</span><span><i style={{ background: storageColor(0) }} />Near avg</span><span><i style={{ background: storageColor(7) }} />+5% to +10%</span><span><i style={{ background: storageColor(12) }} />≥+10%</span></>
          ) : (
            <><span><i style={{ background: "#506779" }} />Lower</span><span><i style={{ background: "#35a3cb" }} />Mid</span><span><i style={{ background: "#0079b5" }} />Highest</span><small>Relative scale; unavailable states are gray.</small></>
          )}
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
            <p>Monthly state-level <strong>marketed production</strong>; distinct from the national dry-production series.</p>
            <dl>
              <div><dt>Latest production</dt><dd>{formatNumber(selectedProduction?.current ?? null)} MMcf</dd></div>
              <div><dt>Month over month</dt><dd>{formatPct(selectedProduction?.monthOverMonthPct ?? null)}</dd></div>
              <div><dt>Year over year</dt><dd>{formatPct(selectedProduction?.yearOverYearPct ?? null)}</dd></div>
              <div><dt>Observation month</dt><dd>{selectedProduction?.period ?? "--"}</dd></div>
            </dl>
            <div className="macro-map-history"><span>State production history</span><HistoricalLineChart ariaLabel={`${selectedName} marketed production history`} unit="MMcf/month" limit={36} series={[{ id: "selected-production", label: selectedName, color: "#70c99a", history: selectedProduction?.history ?? [] }]} /></div>
            {selected === "PA" ? <div className="macro-pa-callout"><strong>RRC relevance</strong><span>Pennsylvania production is a direct Marcellus supply indicator for Range’s operating context.</span></div> : null}
          </>
        )}
        <small>Source: U.S. EIA · retrieved {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "--"}</small>
      </aside>
    </div>
  );
}
