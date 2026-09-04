"use client";

import { useEffect, useState } from "react";
import type { NewsStatusDto } from "@/lib/news/client-types";

export type NewsStatusState = {
  status: NewsStatusDto | null;
  loading: boolean;
  error: string | null;
};

/** Read-only: fetches the most recent pipeline run's summary from GET /api/news/status for the Daily Intelligence header. */
export function useNewsStatus(): NewsStatusState {
  const [state, setState] = useState<NewsStatusState>({ status: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/news/status", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok && response.status !== 503) throw new Error(`News status API returned ${response.status}`);
        return (await response.json()) as NewsStatusDto;
      })
      .then((data) => setState({ status: data, loading: false, error: null }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: null, loading: false, error: error instanceof Error ? error.message : "News status unavailable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}
