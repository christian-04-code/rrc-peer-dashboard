export const CORE_PEER_ORDER = [
  "RRC",
  "AR",
  "CNX",
  "CRK",
  "EQT",
  "EXE",
  "GPOR",
] as const;

export type CoreTicker = (typeof CORE_PEER_ORDER)[number];

export const PEER_COLORS: Record<string, string> = {
  RRC: "#0081C6",
  AR: "#036A36",
  CNX: "#168BBD",
  CRK: "#AA8C54",
  EQT: "#E50670",
  EXE: "#0072B5",
  GPOR: "#93D500",
};

export const PEER_COLOR_SOFT: Record<string, string> = {
  RRC: "#3AA5DE",
  AR: "#4FA87A",
  CNX: "#5AB4D9",
  CRK: "#C7AE81",
  EQT: "#F06AA0",
  EXE: "#4FA9DB",
  GPOR: "#B4E650",
};

export const NEUTRAL_COLOR = "#3D4552";

export const LOGO_PATHS: Record<string, string> = {
  RRC: "/logos/RRC.png",
  AR: "/logos/AR.png",
  CNX: "/logos/CNX.png",
  CRK: "/logos/CRK.png",
  EQT: "/logos/EQT.png",
  EXE: "/logos/EXE.png",
  GPOR: "/logos/GPOR.svg",
};

export const LATEST_QUARTER = "Q1 2026" as const;
export const PRIOR_YEAR_QUARTER = "Q1 2025" as const;
