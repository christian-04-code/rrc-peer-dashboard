import { NextResponse } from "next/server";

const USGS_SEDIMENTARY_BASIN_LAYER =
  "https://energy.usgs.gov/arcgis/rest/services/BaseMaps/Sedimentary_Basin/MapServer/0/query";
const USGS_HAYNESVILLE_FORMATION_LAYER =
  "https://energy.usgs.gov/arcgis/rest/services/StudyAreas/USGulfCoast_webformat/MapServer/61/query";

type GeographySource = {
  endpoint: string;
  where: string;
  outFields: string;
  source: string;
  methodology: string;
};

const SOURCES_BY_VIEW: Record<string, GeographySource> = {
  appalachia: {
    endpoint: USGS_SEDIMENTARY_BASIN_LAYER,
    where: "name = 'Appalachian Basin'",
    outFields: "name",
    source: "U.S. Geological Survey — Sedimentary Basins of the U.S.A.",
    methodology:
      "Reconnaissance-scale sedimentary basin geometry. This layer represents Appalachian basin context, not company acreage or play boundaries."
  },
  "gulf-coast": {
    endpoint: USGS_HAYNESVILLE_FORMATION_LAYER,
    where: "1=1",
    outFields: "*",
    source: "U.S. Geological Survey — U.S. Gulf Coast, Haynesville Formation",
    methodology:
      "USGS Gulf Coast assessment geometry for the Haynesville Formation. This layer provides formation context only and does not represent company acreage, ownership, proved reserves, or operating boundaries."
  }
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view") ?? "";
  const source = SOURCES_BY_VIEW[view];

  if (!source) {
    return NextResponse.json({
      status: "unsupported",
      view,
      source: "No authoritative geographic source configured",
      features: []
    });
  }

  const query = new URLSearchParams({
    where: source.where,
    outFields: source.outFields,
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson"
  });

  let response: Response;
  try {
    response = await fetch(`${source.endpoint}?${query.toString()}`, {
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 86_400 }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: `USGS geography request failed: ${error instanceof Error ? error.message : String(error)}`
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "error",
        message: `USGS geography request returned ${response.status} ${response.statusText}`
      },
      { status: 502 }
    );
  }

  const payload: unknown = await response.json();
  if (!isFeatureCollection(payload)) {
    return NextResponse.json(
      { status: "error", message: "USGS geography response was not a GeoJSON FeatureCollection." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "ok",
    view,
    source: source.source,
    sourceUrl: source.endpoint,
    methodology: source.methodology,
    featureCollection: payload
  });
}

function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GeoJsonFeatureCollection>;
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}
