"use client";

import { useEffect, useState } from "react";
import type { MacroFundamentalsResponse } from "@/lib/market/macro-types";

export function useMacroFundamentals() {
  const [state, setState] = useState<{
    data: MacroFundamentalsResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/macro", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Macro API returned ${response.status}`);
        return (await response.json()) as MacroFundamentalsResponse;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Macro fundamentals unavailable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}
