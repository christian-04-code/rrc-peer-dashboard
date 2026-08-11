// Server-only. Never import this module from a "use client" component -- it reads
// the OIL_PRICE_API secret and must not reach the browser bundle.

export function getOilPriceApiKey(): string {
  const key = process.env.OIL_PRICE_API?.trim();
  if (!key) {
    throw new Error(
      "OIL_PRICE_API is not set. Add it as a server-only environment variable (Vercel project settings) before calling the OilPriceAPI client."
    );
  }
  return key;
}

const OIL_PRICE_API_BASE_URL = "https://api.oilpriceapi.com/v1";
const OIL_PRICE_API_DEMO_URL = `${OIL_PRICE_API_BASE_URL}/demo/prices`;

// 60 minutes -- the free tier is capped around 200 requests/month, far too low to
// poll like Finnhub's ~60s share prices. Uses Next.js's fetch Data Cache (the same
// `next: { revalidate }` primitive already used by lib/eia/client.ts), which persists
// across route-handler invocations independent of the route's own force-dynamic
// setting, so no separate cache/store/infrastructure is needed.
const REVALIDATE_SECONDS = 60 * 60;

export type OilPriceApiQuote = {
  code: string;
  price: number | null;
  currency: string | null;
  unit: string | null;
  dataStatus: string | null;
  asOf: string | null;
  stale: boolean | null;
  synthetic: boolean | null;
  change24hAmount: number | null;
  change24hPercent: number | null;
};

type OilPriceApiPriceRow = {
  code?: unknown;
  price?: unknown;
  currency?: unknown;
  unit?: unknown;
  data_status?: unknown;
  as_of?: unknown;
  stale?: unknown;
  synthetic?: unknown;
  changes?: unknown;
};

type OilPriceApiDemoRow = {
  code?: unknown;
  price?: unknown;
  currency?: unknown;
  updated_at?: unknown;
};

type OilPriceApiPayload = {
  status?: unknown;
  data?: {
    prices?: unknown;
    missing?: unknown;
  };
};

export type OilPriceApiResult = {
  quotesByCode: Map<string, OilPriceApiQuote>;
  missingCodes: string[];
  accessMode: "authenticated" | "keyless-demo";
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Confirmed exact path against the real OilPriceAPI batch payload:
 * price.changes["24h"].amount / price.changes["24h"].percent. Missing or
 * non-numeric values normalize to null -- never substituted with 0, never fabricated.
 */
function extractChange24h(row: OilPriceApiPriceRow): { amount: number | null; percent: number | null } {
  const changes = row.changes && typeof row.changes === "object" ? (row.changes as Record<string, unknown>) : undefined;
  const change24h = changes?.["24h"] && typeof changes["24h"] === "object" ? (changes["24h"] as Record<string, unknown>) : undefined;
  return {
    amount: isFiniteNumber(change24h?.amount) ? change24h.amount : null,
    percent: isFiniteNumber(change24h?.percent) ? change24h.percent : null
  };
}

function normalizeRow(row: OilPriceApiPriceRow): OilPriceApiQuote | null {
  const code = row?.code;
  if (typeof code !== "string" || code.trim() === "") return null;
  const change = extractChange24h(row);
  return {
    code,
    price: isFiniteNumber(row.price) ? row.price : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    unit: typeof row.unit === "string" ? row.unit : null,
    dataStatus: typeof row.data_status === "string" ? row.data_status : null,
    asOf: typeof row.as_of === "string" ? row.as_of : null,
    stale: typeof row.stale === "boolean" ? row.stale : null,
    synthetic: typeof row.synthetic === "boolean" ? row.synthetic : null,
    change24hAmount: change.amount,
    change24hPercent: change.percent
  };
}

function normalizeDemoRow(row: OilPriceApiDemoRow): OilPriceApiQuote | null {
  const code = row?.code;
  if (typeof code !== "string" || code.trim() === "") return null;
  const units: Record<string, string> = { WTI_USD: "bbl", NATURAL_GAS_USD: "MMBtu" };
  return {
    code,
    price: isFiniteNumber(row.price) ? row.price : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    unit: units[code] ?? null,
    dataStatus: "keyless-demo",
    asOf: typeof row.updated_at === "string" ? row.updated_at : null,
    stale: null,
    synthetic: null,
    // The keyless payload exposes one untyped change_24h field. Do not guess
    // whether it is an amount or percentage.
    change24hAmount: null,
    change24hPercent: null
  };
}

/**
 * One batched request for every requested code via OilPriceAPI's documented
 * `by_code=A,B` multi-commodity query (GET /v1/prices/latest) -- never one request
 * per commodity. Cached via Next's fetch Data Cache for 60 minutes so repeated
 * dashboard page loads within that window never re-hit the upstream API. Multi-code
 * responses return an array under `data.prices` (confirmed against the real account);
 * results are matched by `code`, never by array position. Codes absent from
 * `data.prices` -- whether or not `data.missing` also lists them -- are reported as
 * missing, never fabricated.
 */
export async function fetchOilPriceApiQuotes(codes: string[]): Promise<OilPriceApiResult> {
  if (codes.length === 0) return { quotesByCode: new Map(), missingCodes: [], accessMode: "authenticated" };

  const url = new URL(`${OIL_PRICE_API_BASE_URL}/prices/latest`);
  url.searchParams.set("by_code", codes.join(","));

  let response: Response;
  let accessMode: OilPriceApiResult["accessMode"] = "authenticated";
  const apiKey = process.env.OIL_PRICE_API?.trim();

  if (apiKey) {
    try {
      response = await fetch(url, {
        headers: { Authorization: `Token ${apiKey}` },
        next: { revalidate: REVALIDATE_SECONDS }
      });
    } catch (error) {
      throw new Error(
        `OilPriceAPI network request failed for codes "${codes.join(",")}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    response = new Response(null, { status: 401 });
  }

  // OilPriceAPI publishes a keyless, rate-limited current-price endpoint. Use
  // it only when the configured credential is absent/rejected, preserving the
  // authenticated batch endpoint as primary.
  if (response.status === 401 || response.status === 403) {
    accessMode = "keyless-demo";
    try {
      response = await fetch(OIL_PRICE_API_DEMO_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    } catch (error) {
      throw new Error(
        `OilPriceAPI keyless fallback failed for codes "${codes.join(",")}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim() ? ` ${body.slice(0, 300)}` : "";
    throw new Error(`OilPriceAPI request failed: ${response.status} ${response.statusText} for codes "${codes.join(",")}".${detail}`);
  }

  let payload: OilPriceApiPayload;
  try {
    payload = (await response.json()) as OilPriceApiPayload;
  } catch (error) {
    throw new Error(
      `OilPriceAPI returned invalid JSON for codes "${codes.join(",")}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (payload.status !== "success") {
    throw new Error(`OilPriceAPI returned a non-success status for codes "${codes.join(",")}": ${JSON.stringify(payload.status)}`);
  }

  const rawPrices = payload.data?.prices;
  const rows: unknown[] = Array.isArray(rawPrices) ? rawPrices : rawPrices ? [rawPrices] : [];
  const quotesByCode = new Map<string, OilPriceApiQuote>();
  for (const row of rows) {
    const quote = accessMode === "keyless-demo"
      ? normalizeDemoRow(row as OilPriceApiDemoRow)
      : normalizeRow(row as OilPriceApiPriceRow);
    if (quote) quotesByCode.set(quote.code, quote);
  }

  // Derived directly from quotesByCode rather than trusted from payload.data.missing:
  // a requested code absent from data.prices is missing regardless of whether the
  // API's own data.missing list happens to also mention it.
  const missingCodes = codes.filter((code) => !quotesByCode.has(code));

  return { quotesByCode, missingCodes, accessMode };
}
