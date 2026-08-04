import type { CompanyRegistryEntry } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

export function CompanyComparisonSelector({
  companies,
  ticker,
  comparisonTickers,
  maxComparisons,
  onToggle,
  onClear
}: {
  companies: CompanyRegistryEntry[];
  ticker: Ticker;
  comparisonTickers: Ticker[];
  maxComparisons: number;
  onToggle: (ticker: Ticker) => void;
  onClear: () => void;
}) {
  return (
    <div className="selector-block comparison-block">
      <span className="selector-label">Compare peers · {comparisonTickers.length}/{maxComparisons}</span>
      <div>{companies.filter((entry) => entry.ticker !== ticker).map((entry) => <button key={entry.ticker} className={comparisonTickers.includes(entry.ticker) ? "comparison-active" : ""} aria-pressed={comparisonTickers.includes(entry.ticker)} onClick={() => onToggle(entry.ticker)}>{entry.selectorLabel}</button>)}</div>
      <button className="clear-comparisons" onClick={onClear} disabled={comparisonTickers.length === 0}>Clear</button>
    </div>
  );
}
