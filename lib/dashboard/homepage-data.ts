import fixture from "@/fixtures/homepage-mock-data.json";

export type Ticker = "RRC" | "AR" | "CNX" | "CRK" | "EQT" | "EXE" | "GPOR";
export type MetricKey = "share_price" | "total_production" | "free_cash_flow" | "capital_expenditures" | "net_leverage";
export type DataStatus = "supported" | "mock" | "pending";

export type DisplayMetric = {
  key: MetricKey;
  label: string;
  displayValue: string;
  note: string;
  status: DataStatus;
};

export type MarketRibbonItem = {
  key: string;
  label: string;
  displayValue: string;
  change: string;
  status: "mock" | "live" | "delayed";
};

const labels: Record<MetricKey, string> = {
  share_price: "Share price",
  total_production: "Production",
  free_cash_flow: "Free cash flow",
  capital_expenditures: "Capital",
  net_leverage: "Net leverage"
};

const order: MetricKey[] = [
  "share_price",
  "total_production",
  "free_cash_flow",
  "capital_expenditures",
  "net_leverage"
];

export function getHomepageMetrics(ticker: Ticker): DisplayMetric[] {
  const company = fixture.companies[ticker];
  const metrics = company.metrics;

  if (!metrics) {
    return order.map((key) => ({
      key,
      label: labels[key],
      displayValue: "—",
      note: `${ticker} normalized adapter pending`,
      status: "pending"
    }));
  }

  return order.map((key) => {
    const record = metrics[key];
    return {
      key,
      label: labels[key],
      displayValue: record.displayValue,
      note: record.note,
      status: record.status as DataStatus
    };
  });
}

export const marketRibbon = fixture.marketRibbon as MarketRibbonItem[];
export const activityMessages = fixture.activityMessages;
export const fixtureDisclaimer = fixture.disclaimer;
