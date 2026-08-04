import type { CompanyRegistryEntry } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

export function CompanySelector({
  companies,
  ticker,
  onSelect
}: {
  companies: CompanyRegistryEntry[];
  ticker: Ticker;
  onSelect: (ticker: Ticker) => void;
}) {
  return (
    <div className="selector-block">
      <span className="selector-label">Primary company</span>
      <div>{companies.map((entry) => <button key={entry.ticker} className={ticker === entry.ticker ? "active" : ""} onClick={() => onSelect(entry.ticker)}>{entry.selectorLabel}</button>)}</div>
    </div>
  );
}
