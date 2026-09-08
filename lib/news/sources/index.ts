import type { NewsSourceAdapter } from "@/lib/news/sources/types";
import { EiaTodayInEnergyAdapter } from "@/lib/news/sources/eia-today-in-energy";
import { NaturalGasIntelligenceAdapter } from "@/lib/news/sources/natural-gas-intelligence";
import { OilPriceAdapter } from "@/lib/news/sources/oilprice";
import { SecEdgarFilingsAdapter } from "@/lib/news/sources/sec-edgar-filings";

export type { NewsSourceAdapter } from "@/lib/news/sources/types";

/**
 * Deliberately small initial set (Phase 2 architecture decision: start
 * reliable, not comprehensive). Each adapter here was verified against its
 * live upstream during implementation. SEC_USER_AGENT must be set for the
 * EDGAR adapter to construct; if it's missing, exclude it rather than throw
 * out of the whole registry so the other three sources still run.
 */
export function getDefaultSourceAdapters(): NewsSourceAdapter[] {
  const adapters: NewsSourceAdapter[] = [new EiaTodayInEnergyAdapter(), new NaturalGasIntelligenceAdapter(), new OilPriceAdapter()];

  if (process.env.SEC_USER_AGENT) {
    adapters.push(new SecEdgarFilingsAdapter());
  }

  return adapters;
}
