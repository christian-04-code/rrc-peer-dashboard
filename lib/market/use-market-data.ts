"use client";

import { useEffect, useState } from "react";
import type { MarketApiResponse } from "@/lib/market/types";

export type MarketDataState = {
  data: MarketApiResponse | null;
  loading: boolean;
  error: string | null;
};

export function useMarketData(): MarketDataState {
  const [state, setState] = useState<MarketDataState>({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/market", {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`Market API returned ${response.status}`);
        }
        const data = (await response.json()) as MarketApiResponse;
        setState({ data, loading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Market data unavailable"
        });
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return state;
}
