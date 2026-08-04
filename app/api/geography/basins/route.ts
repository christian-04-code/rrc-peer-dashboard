import { NextResponse } from "next/server";

const USGS_BASIN_LAYER =
  "https://energy.usgs.gov/arcgis/rest/services/BaseMaps/Sedimentary_Basin/MapServer/0/query";

const BASINS_BY_VIEW: Record<string, string[]> = {
  appalachia: ["Appalachian Basin"]
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view") ?? "";
  const basinNames = BASINS_BY_VIEW[view];

  if (!basinNames) {
    return NextResponse.json({
      status: "unsupported",
      view,
      source: "USGS Sedimentary Basins of the U.S.A.",
      sourceUrl: USGS_BASIN_LAYER,
      features: []
    });
  }

  const where = basinNames
    .map((name) => `name = '${name.replaceAll("'", "''")}'`)
    .join(" OR ");
  const query = new URLSearchParams({
    where,
    outFields: "name",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson"
  });

  let response: Response;
  try {
    response = await fetch(`${USGS_BASIN_LAYER}?${query.toString()}`, {
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 86_400 }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: `USGS basin request failed: ${error instanceof Error ? error.message : String(error)}`
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "error",
        message: `USGS basin request returned ${response.status} ${response.statusText}`
      },
      { status: 502 }
    );
  }

  const payload: unknown = await response.json();
  if (!isFeatureCollection(payload)) {
    return NextResponse.json(
      { status: "error", message: "USGS basin response was not a GeoJSON FeatureCollection." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "ok",
    view,
    source: "U.S. Geological Survey — Sedimentary Basins of the U.S.A.",
    sourceUrl: USGS_BASIN_LAYER,
    methodology:
      "Reconnaissance-scale sedimentary basin geometry. This layer represents basin context, not company acreage or play boundaries.",
    featureCollection: payload
  });
}

function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GeoJsonFeatureCollection>;
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}
