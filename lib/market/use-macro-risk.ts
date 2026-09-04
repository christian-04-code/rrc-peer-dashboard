"use client";

import { useEffect, useState } from "react";
import type { MacroRiskResponse } from "@/app/api/macro/risk/route";

export function useMacroRisk() {
  const [state, setState] = useState<{
    data: MacroRiskResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/macro/risk", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Macro risk API returned ${response.status}`);
        return (await response.json()) as MacroRiskResponse;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Macro risk data unavailable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}
