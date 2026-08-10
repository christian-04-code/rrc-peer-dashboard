// Server-only. Never import this module from a "use client" component -- it reads
// the FMP_KEY secret and must not reach the browser bundle.

export function getFmpApiKey(): string {
  const key = process.env.FMP_KEY?.trim();
  if (!key) {
    throw new Error(
      "FMP_KEY is not set. Add it as a server-only environment variable (Vercel project settings) before calling the FMP client."
    );
  }
  return key;
}

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

export type FmpQuote = {
  symbol: string;
  price: number | null;
  name?: string;
};

type FmpQuoteApiRow = {
  symbol?: unknown;
  price?: unknown;
  name?: unknown;
};

type FmpErrorPayload = {
  "Error Message"?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Batched real-time quote lookup against FMP's stable /quote endpoint, which serves
 * both equities and commodities by symbol -- one request for every symbol requested
 * rather than one request per symbol. Never returns a fabricated 0 for a missing or
 * invalid quote: a row with a non-finite price comes back with price: null.
 */
async function fetchFmpQuotes(symbols: string[]): Promise<FmpQuote[]> {
  if (symbols.length === 0) return [];

  const url = new URL(`${FMP_BASE_URL}/quote`);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("apikey", getFmpApiKey());

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(
      `FMP API network request failed for symbols "${symbols.join(",")}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim() ? ` ${body.slice(0, 300)}` : "";
    throw new Error(
      `FMP API request failed: ${response.status} ${response.statusText} for symbols "${symbols.join(",")}".${detail}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(
      `FMP API returned invalid JSON for symbols "${symbols.join(",")}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!Array.isArray(payload)) {
    const message =
      payload && typeof payload === "object" && typeof (payload as FmpErrorPayload)["Error Message"] === "string"
        ? (payload as FmpErrorPayload)["Error Message"]
        : "unexpected response shape (expected an array of quotes)";
    throw new Error(`FMP API error for symbols "${symbols.join(",")}": ${message}`);
  }

  return (payload as FmpQuoteApiRow[])
    .map((row): FmpQuote | null => {
      const symbol = row?.symbol;
      if (typeof symbol !== "string" || symbol.trim() === "") return null;
      const price = isFiniteNumber(row?.price) ? row.price : null;
      return { symbol, price, name: typeof row?.name === "string" ? row.name : undefined };
    })
    .filter((quote): quote is FmpQuote => quote !== null);
}

/** Current WTI / Henry Hub commodity quotes (see lib/fmp/symbols.ts for the resolved symbols). */
export function fetchFmpCommodityQuotes(symbols: string[]): Promise<FmpQuote[]> {
  return fetchFmpQuotes(symbols);
}

/** Current share-price quotes for the given tickers. */
export function fetchFmpStockQuotes(tickers: string[]): Promise<FmpQuote[]> {
  return fetchFmpQuotes(tickers);
}
