import type { NewsCategory } from "@/lib/news/types";
import type { ImpactDriverKey } from "@/lib/range-impact-framework";

/**
 * Narrows which framework drivers get sent to the model per article
 * (Section 8: token control -- don't ship the full 8-driver framework on
 * every call when a category already tells us which 2-3 are plausibly
 * relevant). "range"/"peers" get the full set since company-specific news
 * can implicate any driver; every other category maps to a small subset.
 */
const CATEGORY_DRIVER_MAP: Partial<Record<NewsCategory, ImpactDriverKey[]>> = {
  natural_gas: ["gas_pricing", "storage_levels", "gas_rig_activity"],
  lng: ["lng_demand", "gas_pricing"],
  appalachia: ["appalachian_takeaway", "gas_pricing"],
  power_data_centers: ["power_data_center_demand", "gas_pricing"],
  ngl: ["ngl_demand"],
  infrastructure: ["appalachian_takeaway", "regulation"],
  regulatory: ["regulation"]
};

/**
 * News's own fixed subset of the shared lib/range-impact-framework.ts
 * taxonomy -- deliberately NOT `Object.keys(IMPACT_DRIVERS)`. That file also
 * carries Macro-only driver keys (Phase 6); deriving this list from it
 * directly would silently start sending Macro-only drivers to News's AI
 * provider (and, via isImpactDriverKey in lib/news/ai/types.ts, accepting
 * them back) the moment a new Macro key is added there. This explicit list
 * is what News actually shipped before Phase 6 and must keep shipping.
 */
export const NEWS_DRIVER_KEYS: ImpactDriverKey[] = [
  "gas_pricing",
  "lng_demand",
  "appalachian_takeaway",
  "gas_rig_activity",
  "storage_levels",
  "power_data_center_demand",
  "ngl_demand",
  "regulation"
];

export function getRelevantDriverKeys(categories: NewsCategory[]): ImpactDriverKey[] {
  if (categories.includes("range") || categories.includes("peers")) {
    return NEWS_DRIVER_KEYS;
  }

  const relevant = new Set<ImpactDriverKey>();
  for (const category of categories) {
    for (const key of CATEGORY_DRIVER_MAP[category] ?? []) {
      relevant.add(key);
    }
  }

  return relevant.size > 0 ? [...relevant] : NEWS_DRIVER_KEYS;
}
