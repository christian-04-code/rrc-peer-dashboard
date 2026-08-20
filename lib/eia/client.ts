import { EIA_SERIES } from "@/lib/eia/series";

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

// Generic fallback only -- production macro call sites in
// lib/eia/macro-fundamentals.ts each set an explicit timeoutMs sized to their
// own payload/latency profile. This value exists purely so an internal caller
// that forgets to pass timeoutMs still gets a bounded request instead of an
// unbounded one; it must never be the value that decides whether a heavy
// table endpoint (storage/production/demand) succeeds in production.
const DEFAULT_TABLE_TIMEOUT_MS = 30_000;

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

export type EiaTableRow = Record<string, unknown> & {
  period: string;
  value: number;
};

export type EiaTableResult = {
  route: string;
  frequency: EiaFrequency;
  rows: EiaTableRow[];
  fetchedAt: string;
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

// In-flight request de-duplication, scoped to this warm module instance only.
// It does not persist any data: an entry exists only while its request is
// pending and is always removed once that request settles (success or
// failure), so the next call -- whether from a fresh burst of concurrent
// requests or just the next invocation -- always issues a real request. This
// is purely a same-instance optimization for genuinely simultaneous identical
// requests (e.g. multiple in-flight EIA fetches from one Promise.allSettled
// batch or overlapping /api/macro invocations landing on the same warm
// instance); it does nothing across separate serverless instances, which is
// what CDN-level Cache-Control already covers.
const inFlightEiaTableRequests = new Map<string, Promise<EiaTableResult>>();

/**
 * Server-side-only failure log for a table request. Deliberately omits the
 * request URL (it carries the EIA api_key as a query param) and logs only
 * the route/frequency/timing/failure-kind fields useful for diagnosing a
 * production Macro-tab regression from Vercel logs.
 */
function logEiaTableFailure(details: {
  route: string;
  frequency: EiaFrequency;
  elapsedMs: number;
  timeoutMs: number;
  reason: "timeout" | "network" | `http_${number}`;
}): void {
  console.error("[EIA table]", details);
}

async function requestEiaTable(url: URL, route: string, params: { frequency: EiaFrequency; revalidate?: number; timeoutMs?: number }): Promise<EiaTableResult> {
  // Bounded so a hung/stalled EIA connection fails fast into the normal
  // Promise.allSettled degraded-response path instead of blocking the whole
  // /api/macro invocation (and the other two, unrelated fetches) until the
  // platform's hard function timeout kills it with no usable response at all.
  // Table endpoints vary widely in payload size (storage/production tables
  // are much heavier than demand), so callers own their own timeout instead
  // of inheriting one global cutoff -- see lib/eia/macro-fundamentals.ts.
  const timeoutMs = params.timeoutMs ?? DEFAULT_TABLE_TIMEOUT_MS;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: params.revalidate ?? 3600 }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
    logEiaTableFailure({ route, frequency: params.frequency, elapsedMs: Date.now() - startedAt, timeoutMs, reason });
    throw new Error(`EIA table request failed for route "${route}": ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logEiaTableFailure({
      route,
      frequency: params.frequency,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      reason: `http_${response.status}`
    });
    throw new Error(`EIA table request failed: ${response.status} for route "${route}".${body.trim() ? ` ${body.slice(0, 300)}` : ""}`);
  }

  const payload = (await response.json()) as EiaApiPayload;
  const data = payload.response?.data;
  if (!Array.isArray(data)) throw new Error(`EIA table response for route "${route}" did not contain a data array.`);
  const rows = data.flatMap((candidate): EiaTableRow[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Record<string, unknown>;
    const period = row.period;
    const rawValue = row.value;
    const value = typeof rawValue === "string" ? Number.parseFloat(rawValue) : rawValue;
    if (typeof period !== "string" || typeof value !== "number" || !Number.isFinite(value)) return [];
    return [{ ...row, period, value }];
  });
  if (rows.length === 0) throw new Error(`EIA table response for route "${route}" contained no usable numeric rows.`);
  return { route, frequency: params.frequency, rows, fetchedAt: new Date().toISOString() };
}

export async function fetchEiaTable(params: {
  route: string;
  frequency: EiaFrequency;
  facets?: Record<string, readonly string[]>;
  length?: number;
  revalidate?: number;
  /**
   * Production callers (lib/eia/macro-fundamentals.ts) must pass this
   * explicitly, sized to their own payload/latency profile. Omitting it
   * falls back to DEFAULT_TABLE_TIMEOUT_MS, which is a generic safety net,
   * not a per-endpoint production setting.
   */
  timeoutMs?: number;
}): Promise<EiaTableResult> {
  const route = params.route.trim().replace(/^\/+|\/+$/g, "");
  const length = params.length ?? 5000;
  if (!route) throw new Error("EIA route is required.");
  validateLength(length);

  const url = new URL(`${EIA_BASE_URL}/${route}`);
  url.searchParams.set("api_key", getEiaApiKey());
  url.searchParams.set("frequency", params.frequency);
  url.searchParams.append("data[0]", "value");
  for (const [facet, values] of Object.entries(params.facets ?? {})) {
    for (const value of values) url.searchParams.append(`facets[${facet}][]`, value);
  }
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("offset", "0");
  url.searchParams.set("length", String(length));

  const key = url.toString();
  const existing = inFlightEiaTableRequests.get(key);
  if (existing) return existing;

  const request = requestEiaTable(url, route, params).finally(() => {
    inFlightEiaTableRequests.delete(key);
  });
  inFlightEiaTableRequests.set(key, request);
  return request;
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
    seriesId: EIA_SERIES.henryHub,
    frequency: "daily",
    length
  });
}

/** Cushing, Oklahoma WTI spot price, daily, $/barrel. */
export function fetchWtiDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({ seriesId: EIA_SERIES.wti, frequency: "daily", length });
}

/** Europe Brent spot price, daily, $/barrel. */
export function fetchBrentDailySpot(length = 30): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({ seriesId: EIA_SERIES.brent, frequency: "daily", length });
}

/** Lower 48 working gas in underground storage, weekly, Bcf. */
export function fetchLower48StorageWeekly(length = 12): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: EIA_SERIES.lower48Storage,
    frequency: "weekly",
    length
  });
}

/** U.S. LNG exports, monthly, million cubic feet. */
export function fetchUsLngExportsMonthly(length = 12): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: EIA_SERIES.lngExports,
    frequency: "monthly",
    length
  });
}

/** U.S. dry natural gas production, monthly, million cubic feet. */
export function fetchUsDryGasProductionMonthly(length = 24): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: EIA_SERIES.usDryGasProduction,
    frequency: "monthly",
    length
  });
}

/** U.S. ending stocks of fractionated propane ready for sale, weekly, thousand barrels. */
export function fetchUsPropaneStocksWeekly(length = 104): Promise<EiaFetchResult> {
  return fetchEiaSeriesById({
    seriesId: EIA_SERIES.propaneStocks,
    frequency: "weekly",
    length
  });
}

export async function getLatestHenryHubPrice(): Promise<EiaDataPoint> {
  const result = await fetchHenryHubDailySpot(5);
  return result.points[0];
}
