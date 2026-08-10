import type { StorageRegionId } from "@/lib/market/macro-types";

export const STORAGE_REGION_LABELS: Record<StorageRegionId, string> = {
  east: "East",
  midwest: "Midwest",
  southCentral: "South Central",
  mountain: "Mountain",
  pacific: "Pacific"
};

const REGION_STATES: Record<StorageRegionId, readonly string[]> = {
  east: ["CT", "DE", "DC", "FL", "GA", "MA", "MD", "ME", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "VT", "VA", "WV"],
  midwest: ["IL", "IN", "IA", "KY", "MI", "MN", "MO", "TN", "WI"],
  southCentral: ["AL", "AR", "KS", "LA", "MS", "OK", "TX"],
  mountain: ["AZ", "CO", "ID", "MT", "NE", "NM", "NV", "ND", "SD", "UT", "WY"],
  pacific: ["CA", "OR", "WA"]
};

const STATE_TO_REGION = new Map<string, StorageRegionId>(
  Object.entries(REGION_STATES).flatMap(([region, states]) =>
    states.map((state) => [state, region as StorageRegionId])
  )
);

export function getStorageRegionForState(stateCode: string): StorageRegionId | null {
  return STATE_TO_REGION.get(stateCode.toUpperCase()) ?? null;
}

export const STATE_META = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]
] as const;

const NAME_TO_CODE = new Map<string, string>(STATE_META.map(([code, name]) => [name, code]));

export function getStateCode(stateName: string): string | null {
  return NAME_TO_CODE.get(stateName) ?? null;
}

export function getStateName(stateCode: string): string | null {
  return STATE_META.find(([code]) => code === stateCode.toUpperCase())?.[1] ?? null;
}
