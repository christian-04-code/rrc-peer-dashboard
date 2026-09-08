"use client";

import { useEffect, useState } from "react";
import type { MacroSteoResponse } from "@/app/api/macro/steo/route";

export function useMacroSteo() {
  const [state, setState] = useState<{
    data: MacroSteoResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/macro/steo", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Macro STEO API returned ${response.status}`);
        return (await response.json()) as MacroSteoResponse;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : "STEO outlook unavailable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}
