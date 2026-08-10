import fixture from "@/fixtures/homepage-mock-data.json";

export type Ticker = "RRC" | "AR" | "CNX" | "CRK" | "EQT" | "EXE" | "GPOR";

export type MarketRibbonItem = {
  key: string;
  label: string;
  displayValue: string;
  change: string;
  status: "mock" | "live" | "delayed";
};

export const marketRibbon = fixture.marketRibbon as MarketRibbonItem[];
export const activityMessages = fixture.activityMessages;
export const fixtureDisclaimer = fixture.disclaimer;
