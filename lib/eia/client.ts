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
  period: string;
  value: number;
};

export type EiaFetchResult = {
  route: string;
  seriesId: string;
  frequency: EiaFrequency;
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
  route: string;
  seriesId: string;
  frequency: EiaFrequency;
  length?: number;
};

function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < 1 || length > 5000) {
    throw new Error("EIA request length must be an integer between 1 and 5000.");
  }
}

async function requestEia(
  url: URL,
  context: { route: string; seriesId: string; frequency: EiaFrequency }
): Promise<EiaFetchResult> {
  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: 900 } });
  } catch (error) {
    throw new Error(
      `EIA API network request failed for route "${context.route}" series "${context.seriesId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim() ? ` ${body.slice(0, 300)}` : "";
    throw new Error(
      `EIA API request failed: ${response.status} ${response.statusText} for route "${context.route}" series "${context.seriesId}".${detail}`
    );
  }

  let payload: EiaApiPayload;
  try {
    payload = (await response.json()) as EiaApiPayload;
  } catch (error) {
    throw new Error(
      `EIA API returned invalid JSON for route "${context.route}" series "${context.seriesId}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const rows = payload.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `EIA API returned no rows for route "${context.route}" series "${context.seriesId}".`
    );
  }

  const points = rows
    .map((row: EiaApiRow): EiaDataPoint | null => {
      const period = row?.period;
      const rawValue = row?.value;
      const value =
        typeof rawValue === "string" ? Number.parseFloat(rawValue) : rawValue;

      if (
        typeof period !== "string" ||
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) {
        return null;
      }

      return { period, value };
    })
    .filter((point): point is EiaDataPoint => point !== null)
    .sort((a, b) => b.period.localeCompare(a.period));

  if (points.length === 0) {
    throw new Error(
      `EIA API response for series "${context.seriesId}" contained no usable numeric rows.`
    );
  }

  return { ...context, points, fetchedAt: new Date().toISOString() };
}

export async function fetchEiaSeries(
  params: FetchEiaSeriesParams
): Promise<EiaFetchResult> {
  const route = params.route.trim().replace(/^\/+|\/+$/g, "");
  const seriesId = params.seriesId.trim();
  const { frequency } = params;
  const length = params.length ?? 30;

  if (!route) throw new Error("EIA route is required.");
  if (!seriesId) throw new Error("EIA series ID is required.");
  validateLength(length);

  const url = new URL(`${EIA_BASE_URL}/${route}`);
  url.searchParams.set("api_key", getEiaApiKey());
  url.searchParams.set("frequency", frequency);
  url.searchParams.append("data[0]", "value");
  url.searchParams.append("facets[series][]", seriesId);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", String(length));

  return requestEia(url, { route, seriesId, frequency });
}

/** Fetch a legacy EIA series through the supported API v2 /seriesid route. */
export async function fetchEiaSeriesById(params: {
  seriesId: string;
  frequency: EiaFrequency;
  length?: number;
}): Promise<EiaFetchResult> {
  const seriesId = params.seriesId.trim();
  const length = params.length ?? 30;
  if (!seriesId) throw new Error("EIA series ID is required.");
  validateLength(length);

  const route = `seriesid/${encodeURIComponent(seriesId)}`;
  const url = new URL(`${EIA_BASE_URL}/${route}`);
  url.searchParams.set("api_key", getEiaApiKey());
  url.searchParams.set("length", String(length));

  return requestEia(url, { route, seriesId, frequency: params.frequency });
}

/** Henry Hub Natural Gas Spot Price, daily, $/MMBtu. */
export function fetchHenryHubDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeries({
    route: "natural-gas/pri/fut/data",
    seriesId: "RNGWHHD",
    frequency: "daily",
    length
  });
}

/** Cushing, Oklahoma WTI spot price, daily, $/barrel. */
export function fetchWtiDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({ seriesId: "PET.RWTC.D", frequency: "daily", length });
}

/** Europe Brent spot price, daily, $/barrel. */
export function fetchBrentDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({ seriesId: "PET.RBRTE.D", frequency: "daily", length });
}

/** Lower 48 working gas in underground storage, weekly, Bcf. */
export function fetchLower48StorageWeekly(length = 12): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: "NG.NW2_EPG0_SWO_R48_BCF.W",
    frequency: "weekly",
    length
  });
}

/** U.S. LNG exports, monthly, million cubic feet. */
export function fetchUsLngExportsMonthly(length = 12): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: "NG.N9133US2.M",
    frequency: "monthly",
    length
  });
}

export async function getLatestHenryHubPrice(): Promise<EiaDataPoint> {
  const result = await fetchHenryHubDailySpot(5);
  return result.points[0];
}
