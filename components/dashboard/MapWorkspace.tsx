"use client";

import { useEffect, useMemo, useState } from "react";
import { getCompany } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = Position[][][];

type BasinFeature = {
  type: "Feature";
  properties?: { name?: string };
  geometry:
    | { type: "Polygon"; coordinates: PolygonCoordinates }
    | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };
};

type BasinResponse = {
  status: "ok" | "unsupported" | "error";
  view?: string;
  source?: string;
  methodology?: string;
  message?: string;
  featureCollection?: {
    type: "FeatureCollection";
    features: BasinFeature[];
  };
};

export function MapWorkspace({
  ticker,
  comparisonTickers,
  onOpen
}: {
  ticker: Ticker;
  comparisonTickers: Ticker[];
  onOpen: (value: string) => void;
}) {
  const company = getCompany(ticker);
  const [result, setResult] = useState<BasinResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);

    fetch(`/api/geography/basins?view=${encodeURIComponent(company.defaultMapView)}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as BasinResponse;
        if (!response.ok) throw new Error(payload.message ?? "Basin request failed.");
        return payload;
      })
      .then(setResult)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResult({ status: "error", message: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [company.defaultMapView]);

  const paths = useMemo(() => {
    if (result?.status !== "ok" || !result.featureCollection) return [];
    return result.featureCollection.features.flatMap((feature) =>
      geometryToPaths(feature.geometry).map((path, index) => ({
        key: `${feature.properties?.name ?? "basin"}-${index}`,
        name: feature.properties?.name ?? "Sedimentary basin",
        path
      }))
    );
  }, [result]);

  return (
    <div className="map-area">
      <div className="map-toolbar">
        <div>
          <h2>U.S. energy exposure map</h2>
          <p>{company.primaryRegion} · {company.primaryBasin} · default view: {company.defaultMapView}</p>
        </div>
        <div>
          <button className="active">Basins</button>
          <button disabled>Routes</button>
          <button disabled>LNG</button>
          <button disabled>Demand</button>
        </div>
      </div>

      <div className="map-placeholder authoritative-map">
        {loading ? <p className="map-state">Loading authoritative basin geometry…</p> : null}

        {!loading && result?.status === "ok" && paths.length > 0 ? (
          <svg viewBox="0 0 760 420" role="img" aria-label={`${company.primaryRegion} sedimentary basin context from the U.S. Geological Survey`}>
            <rect x="0" y="0" width="760" height="420" className="map-background" />
            {paths.map((item) => (
              <path
                key={item.key}
                d={item.path}
                className="authoritative-basin"
                tabIndex={0}
                role="button"
                aria-label={`${item.name} source detail`}
                onClick={() => onOpen(`${item.name}\n\nSource: ${result.source}\n\n${result.methodology}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(`${item.name}\n\nSource: ${result.source}\n\n${result.methodology}`);
                  }
                }}
              />
            ))}
          </svg>
        ) : null}

        {!loading && result?.status === "unsupported" ? (
          <p className="map-state">
            Authoritative basin geometry is not yet mapped for this company context. No approximate shape is shown.
          </p>
        ) : null}

        {!loading && result?.status === "error" ? (
          <p className="map-state map-error">{result.message ?? "Authoritative map data could not be loaded."}</p>
        ) : null}

        <strong>{ticker} selected · peers: {comparisonTickers.length ? comparisonTickers.join(", ") : "none"}</strong>
      </div>

      <p>
        USGS reconnaissance-scale sedimentary basin context only. This is not company acreage, play-level exposure, pipeline routing, or a claim of operating ownership.
      </p>
    </div>
  );
}

function geometryToPaths(geometry: BasinFeature["geometry"]): string[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) =>
    polygon
      .map((ring) =>
        ring
          .map(([longitude, latitude], index) => {
            const [x, y] = projectLower48(longitude, latitude);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ") + " Z"
      )
      .join(" ")
  );
}

function projectLower48(longitude: number, latitude: number): [number, number] {
  const minLongitude = -125;
  const maxLongitude = -66.5;
  const minLatitude = 24;
  const maxLatitude = 50;
  const x = ((longitude - minLongitude) / (maxLongitude - minLongitude)) * 760;
  const y = ((maxLatitude - latitude) / (maxLatitude - minLatitude)) * 420;
  return [x, y];
}
