import type { Ticker } from "@/lib/dashboard/company-registry";
import type { StockHistoryDataset } from "@/lib/market/stock-detail-types";
import AR from "@/data/stock-history/AR.json";
import CNX from "@/data/stock-history/CNX.json";
import CRK from "@/data/stock-history/CRK.json";
import EQT from "@/data/stock-history/EQT.json";
import EXE from "@/data/stock-history/EXE.json";
import GPOR from "@/data/stock-history/GPOR.json";
import RRC from "@/data/stock-history/RRC.json";

const DATASETS = { RRC, AR, CNX, CRK, EQT, EXE, GPOR } as unknown as Record<Ticker, StockHistoryDataset>;

export function getWorkbookStockHistory(ticker: Ticker): StockHistoryDataset { return DATASETS[ticker]; }
