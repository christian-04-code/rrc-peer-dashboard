export function getEiaApiKey(): string {
  const key = process.env.EIA_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "EIA_API_KEY is not set. Add it to .env.local before calling the EIA client."
    );
  }
  return key;
}

const EIA_BASE_URL = "https://api.eia.gov/v2";

export type EiaFrequency = "daily" | "weekly" | "monthly" | "annual";

export type EiaDataPoint = {
  /** ISO-like period string as returned by EIA. */
  period: string;
  value: number;
};

export type EiaFetchResult = {
  route: string;
  seriesId: string;
  frequency: EiaFrequency;
  /** Sorted most-recent-first. */
  points: EiaDataPoint[];
  fetchedAt: string;
};

type EiaApiRow = {
  period?: unknown;
  value?: unknown;
};

type EiaApiPayload = {
  response?: {
    data?: unknown;
  };
};

export type FetchEiaSeriesParams = {
  /** EIA v2 route beneath /v2/, e.g. "natural-gas/pri/fut/data". */
  route: string;
  /** facet[series][] value, e.g. "RNGWHHD" for Henry Hub daily spot. */
  seriesId: string;
  frequency: EiaFrequency;
  /** Number of most-recent points to request. Default 30. */
  length?: number;
};

/**
 * Low-level fetcher for any EIA v2 API route/series.
 *
 * Throws on invalid input, network failure, non-2xx response, invalid JSON,
 * or a payload with no usable numeric rows. It never fabricates, interpolates,
 * or silently substitutes values.
 */
export async function fetchEiaSeries(
  params: FetchEiaSeriesParams
): Promise<EiaFetchResult> {
  const route = params.route.trim().replace(/^\/+|\/+$/g, "");
  const seriesId = params.seriesId.trim();
  const { frequency } = params;
  const length = params.length ?? 30;

  if (!route) {
    throw new Error("EIA route is required.");
  }
  if (!seriesId) {
    throw new Error("EIA series ID is required.");
  }
  if (!Number.isInteger(length) || length < 1 || length > 5000) {
    throw new Error("EIA request length must be an integer between 1 and 5000.");
  }

  const apiKey = getEiaApiKey();
  const url = new URL(`${EIA_BASE_URL}/${route}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("frequency", frequency);
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[series][]", seriesId);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", String(length));

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `EIA API network request failed for route "${route}" series "${seriesId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim() ? ` ${body.slice(0, 300)}` : "";
    throw new Error(
      `EIA API request failed: ${response.status} ${response.statusText} for route "${route}" series "${seriesId}".${detail}`
    );
  }

  let payload: EiaApiPayload;
  try {
    payload = (await response.json()) as EiaApiPayload;
  } catch (error) {
    throw new Error(
      `EIA API returned invalid JSON for route "${route}" series "${seriesId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const rows = payload.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `EIA API returned no rows for route "${route}" series "${seriesId}". Check that the route path and series ID are still valid.`
    );
  }

  const points = rows
    .map((row: EiaApiRow): EiaDataPoint | null => {
      const period = row?.period;
      const rawValue = row?.value;
      const value =
        typeof rawValue === "string" ? Number.parseFloat(rawValue) : rawValue;

      if (typeof period !== "string" || typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }

      return { period, value };
    })
    .filter((point): point is EiaDataPoint => point !== null);

  if (points.length === 0) {
    throw new Error(
      `EIA API response for series "${seriesId}" contained rows but none had valid period and numeric value fields.`
    );
  }

  return {
    route,
    seriesId,
    frequency,
    points,
    fetchedAt: new Date().toISOString(),
  };
}

/** Henry Hub Natural Gas Spot Price, daily, $/MMBtu. */
export async function fetchHenryHubDailySpot(
  length = 30
): Promise<EiaFetchResult> {
  return fetchEiaSeries({
    route: "natural-gas/pri/fut/data",
    seriesId: "RNGWHHD",
    frequency: "daily",
    length,
  });
}

/** Return the single most recent Henry Hub spot price point. */
export async function getLatestHenryHubPrice(): Promise<EiaDataPoint> {
  const result = await fetchHenryHubDailySpot(5);
  return result.points[0];
}
