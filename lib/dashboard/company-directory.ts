import type { Ticker } from "@/lib/dashboard/company-registry";

const STOCK_COMPANIES: Record<Ticker, string> = {
  RRC: "Range Resources Corporation",
  AR: "Antero Resources Corporation",
  CNX: "CNX Resources Corporation",
  CRK: "Comstock Resources, Inc.",
  EQT: "EQT Corporation",
  EXE: "Expand Energy Corporation",
  GPOR: "Gulfport Energy Corporation"
};

export function getStockCompany(value: string): { ticker: Ticker; name: string } | null {
  const ticker = value.toUpperCase();
  return ticker in STOCK_COMPANIES ? { ticker: ticker as Ticker, name: STOCK_COMPANIES[ticker as Ticker] } : null;
}
