import type { NewsCategory } from "@/lib/news/types";
import { IMPACT_DRIVERS, type ImpactDriverKey } from "@/lib/news/impact-framework";

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

const ALL_DRIVER_KEYS = Object.keys(IMPACT_DRIVERS) as ImpactDriverKey[];

export function getRelevantDriverKeys(categories: NewsCategory[]): ImpactDriverKey[] {
  if (categories.includes("range") || categories.includes("peers")) {
    return ALL_DRIVER_KEYS;
  }

  const relevant = new Set<ImpactDriverKey>();
  for (const category of categories) {
    for (const key of CATEGORY_DRIVER_MAP[category] ?? []) {
      relevant.add(key);
    }
  }

  return relevant.size > 0 ? [...relevant] : ALL_DRIVER_KEYS;
}
