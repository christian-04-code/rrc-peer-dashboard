export function getEiaApiKey(): string {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    throw new Error(
      "EIA_API_KEY is not set. Add it to .env.local before calling the EIA client."
    );
  }
  return key;
}

const EIA_BASE_URL = "https://api.eia.gov/v2";

export type EiaDataPoint = {
  /** ISO date string as returned by EIA, e.g. "2026-08-01" for daily series. */
  period: string;
  value: number;
};

export type EiaFetchResult = {
  route: string;
  seriesId: string;
  frequency: string;
  /** Sorted most-recent-first. */
  points: EiaDataPoint[];
  fetchedAt: string;
};

/**
 * Low-level fetcher for any EIA v2 API route/series.
 *
 * Throws on network failure, non-2xx response, or a payload with no usable
 * numeric rows -- it never returns a fabricated/interpolated value. Callers
 * must catch and render "--" (never a guessed number), per project rule:
 * "Unsupported values render '--', never zero, never a guess."
 */
async function fetchEiaSeries(params: {
  /** EIA v2 route beneath /v2/, e.g. "natural-gas/pri/fut/data". */
  route: string;
  /** facet[series][] value, e.g. "RNGWHHD" for Henry Hub daily spot. */
  seriesId: string;
  frequency: "daily" | "weekly" | "monthly" | "annual";
  /** How many most-recent points to request. Default 30. */
  length?: number;
}): Promise<EiaFetchResult> {
  const { route, seriesId, frequency, length = 30 } = params;
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

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (err) {
    throw new Error(
      `EIA API network request failed for route "${route}" series "${seriesId}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `EIA API request failed: ${res.status} ${res.statusText} for route "${route}" series "${seriesId}". ${body.slice(
        0,
        300
      )}`
    );
  }

  const json = await res.json();
  const rows: unknown = json?.response?.data;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `EIA API returned no rows for route "${route}" series "${seriesId}". Check that the route path and series ID are still valid -- EIA occasionally restructures routes.`
    );
  }

  const points: EiaDataPoint[] = rows
    .map((row: any) => {
      const raw = row?.value;
      const numeric = typeof raw === "string" ? parseFloat(raw) : raw;
      return { period: row?.period as string, value: numeric as number };
    })
    .filter((p) => typeof p.period === "string" && Number.isFinite(p.value));

  if (points.length === 0) {
    throw new Error(
      `EIA API response for series "${seriesId}" contained rows but none had a valid numeric "value" field -- payload shape may have changed.`
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

/**
 * Henry Hub Natural Gas Spot Price, daily, $/MMBtu.
 *
 * EIA v2 route: natural-gas/pri/fut/data
 * Series ID: RNGWHHD (legacy v1 series ID "NG.RNGWHHD.D"; this is the
 * correct facet[series][] value for the v2 route -- confirmed against
 * EIA's own historical-data page sourcekey and third-party EIA API
 * wrapper libraries, and confirmed live via curl test 2026-08-04.
 */
export async function fetchHenryHubDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeries({
    route: "natural-gas/pri/fut/data",
    seriesId: "RNGWHHD",
    frequency: "daily",
    length,
  });
}

/**
 * Convenience helper: the single most recent Henry Hub spot price point.
 * Throws if no data is available -- callers must not substitute a
 * fabricated fallback value (e.g. a hardcoded "typical" price).
 */
export async function getLatestHenryHubPrice(): Promise<EiaDataPoint> {
  const result = await fetchHenryHubDailySpot(5);
  return result.points[0];
}
