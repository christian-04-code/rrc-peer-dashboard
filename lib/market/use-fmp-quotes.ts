"use client";

import { useEffect, useState } from "react";
import type { FmpQuotesResponse } from "@/lib/market/fmp-types";

// ~60s polling per task spec -- short enough to feel current, far short of
// hammering FMP on every render. No WebSockets in this phase.
const REFRESH_INTERVAL_MS = 60_000;

export type FmpQuotesState = {
  data: FmpQuotesResponse | null;
  loading: boolean;
  error: string | null;
};

export function useFmpQuotes(): FmpQuotesState {
  const [state, setState] = useState<FmpQuotesState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/quotes", { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Quotes API returned ${response.status}`);
        const data = (await response.json()) as FmpQuotesResponse;
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        // Keep the last known-good quotes on a transient poll failure rather than
        // blanking the UI to "--"; each quote still carries its own fetchedAt from
        // the last successful response, so nothing is mislabeled as fresher than it is.
        setState((current) => ({
          data: current.data,
          loading: false,
          error: error instanceof Error ? error.message : "Current market quotes unavailable"
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
