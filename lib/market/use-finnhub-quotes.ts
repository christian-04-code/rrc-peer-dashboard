"use client";

import { useEffect, useState } from "react";
import type { FinnhubQuotesResponse } from "@/lib/market/finnhub-types";

// ~60s polling per task spec -- short enough to feel current, far short of
// hammering Finnhub on every render. No WebSockets in this phase.
const REFRESH_INTERVAL_MS = 60_000;

export type FinnhubQuotesState = {
  data: FinnhubQuotesResponse | null;
  loading: boolean;
  error: string | null;
};

export function useFinnhubQuotes(): FinnhubQuotesState {
  const [state, setState] = useState<FinnhubQuotesState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/share-prices", { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Share-prices API returned ${response.status}`);
        const data = (await response.json()) as FinnhubQuotesResponse;
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        // Keep the last known-good quotes on a transient poll failure rather than
        // blanking the UI to "--"; each quote still carries its own fetchedAt from
        // the last successful response, so nothing is mislabeled as fresher than it is.
        setState((current) => ({
          data: current.data,
          loading: false,
          error: error instanceof Error ? error.message : "Current share prices unavailable"
        }));
      }
    }

    load();
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
