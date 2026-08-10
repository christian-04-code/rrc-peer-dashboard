// Server-only. Never import this module from a "use client" component -- it reads
// the FINNHUB_API_KEY secret and must not reach the browser bundle.

export function getFinnhubApiKey(): string {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "FINNHUB_API_KEY is not set. Add it as a server-only environment variable (Vercel project settings) before calling the Finnhub client."
    );
  }
  return key;
}

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export type FinnhubQuote = {
  symbol: string;
  price: number | null;
  timestamp: number | null;
};

type FinnhubQuoteApiPayload = {
  c?: unknown; // current price
  t?: unknown; // quote timestamp, unix seconds
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Finnhub's /quote endpoint is single-symbol only (no batch param like FMP's
 * stable/quote), so covering N tickers requires N requests -- issued in parallel
 * server-side, still just one request from the browser to our own route.
 * Per the verified account behavior, Finnhub returns c: 0 (with every other
 * field also 0) for an unknown/no-data symbol rather than a distinct error, so
 * a non-finite or non-positive price is normalized to null, never surfaced as
 * a literal $0 share price.
 */
async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote> {
  const url = new URL(`${FINNHUB_BASE_URL}/quote`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", getFinnhubApiKey());

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(
      `Finnhub API network request failed for symbol "${symbol}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim() ? ` ${body.slice(0, 300)}` : "";
    throw new Error(`Finnhub API request failed: ${response.status} ${response.statusText} for symbol "${symbol}".${detail}`);
  }

  let payload: FinnhubQuoteApiPayload;
  try {
    payload = (await response.json()) as FinnhubQuoteApiPayload;
  } catch (error) {
    throw new Error(
      `Finnhub API returned invalid JSON for symbol "${symbol}": ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const price = isFiniteNumber(payload.c) && payload.c > 0 ? payload.c : null;
  const timestamp = isFiniteNumber(payload.t) && payload.t > 0 ? payload.t : null;
  return { symbol, price, timestamp };
}

/** Current share-price quotes for the given tickers, one request per ticker, in parallel. */
export function fetchFinnhubQuotes(symbols: string[]): Promise<PromiseSettledResult<FinnhubQuote>[]> {
  return Promise.allSettled(symbols.map((symbol) => fetchFinnhubQuote(symbol)));
}
