// Server-only: this module reads OIL_PRICE_API and must not enter the client bundle.
export function getOilPriceApiKey(): string {
  const key = process.env.OIL_PRICE_API?.trim();
  if (!key) throw new Error("OIL_PRICE_API is not set.");
  return key;
}

const BASE_URL = "https://api.oilpriceapi.com/v1";
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

type OilPriceApiPayload = {
  status?: unknown;
  data?: { prices?: unknown };
};

export type OilPriceApiResult = {
  quotesByCode: Map<string, OilPriceApiQuote>;
  missingCodes: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeRow(row: OilPriceApiPriceRow): OilPriceApiQuote | null {
  if (typeof row.code !== "string" || !row.code.trim()) return null;
  const changes = row.changes && typeof row.changes === "object" ? row.changes as Record<string, unknown> : undefined;
  const day = changes?.["24h"] && typeof changes["24h"] === "object" ? changes["24h"] as Record<string, unknown> : undefined;
  return {
    code: row.code,
    price: finite(row.price) ? row.price : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    unit: typeof row.unit === "string" ? row.unit : null,
    dataStatus: typeof row.data_status === "string" ? row.data_status : null,
    asOf: typeof row.as_of === "string" ? row.as_of : null,
    stale: typeof row.stale === "boolean" ? row.stale : null,
    synthetic: typeof row.synthetic === "boolean" ? row.synthetic : null,
    change24hAmount: finite(day?.amount) ? day.amount : null,
    change24hPercent: finite(day?.percent) ? day.percent : null
  };
}

export async function fetchOilPriceApiQuotes(codes: string[]): Promise<OilPriceApiResult> {
  if (!codes.length) return { quotesByCode: new Map(), missingCodes: [] };
  const url = new URL(`${BASE_URL}/prices/latest`);
  url.searchParams.set("by_code", codes.join(","));
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Token ${getOilPriceApiKey()}` },
      next: { revalidate: REVALIDATE_SECONDS }
    });
  } catch (error) {
    throw new Error(`OilPriceAPI network request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OilPriceAPI request failed: ${response.status} ${response.statusText}.${body.trim() ? ` ${body.slice(0, 300)}` : ""}`);
  }
  let payload: OilPriceApiPayload;
  try {
    payload = await response.json() as OilPriceApiPayload;
  } catch (error) {
    throw new Error(`OilPriceAPI returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (payload.status !== "success") throw new Error(`OilPriceAPI returned non-success status: ${JSON.stringify(payload.status)}`);
  const raw = payload.data?.prices;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const quotesByCode = new Map<string, OilPriceApiQuote>();
  for (const candidate of rows as OilPriceApiPriceRow[]) {
    const quote = normalizeRow(candidate);
    if (quote) quotesByCode.set(quote.code, quote);
  }
  return { quotesByCode, missingCodes: codes.filter((code) => !quotesByCode.has(code)) };
}
