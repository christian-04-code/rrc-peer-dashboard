import type { Ticker } from "@/lib/dashboard/company-registry";

export function StockDetailButton({ ticker, compact = false }: { ticker: Ticker; compact?: boolean }) {
  return (
    <a
      className={compact ? "stock-detail-button stock-detail-button--compact" : "stock-detail-button"}
      href={`/stocks/${ticker}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${ticker} stock detail in a new tab`}
      title={`Open ${ticker} stock detail`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 15.5V4.5M3 15.5h14M5.5 12l3-3 2.5 2 4-5" />
      </svg>
      {!compact && <span>Stock detail</span>}
    </a>
  );
}

