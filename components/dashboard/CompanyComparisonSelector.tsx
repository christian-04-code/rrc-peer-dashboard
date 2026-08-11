import type { CompanyRegistryEntry } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

export function CompanyComparisonSelector({
  companies,
  selectedTickers,
  focusedTicker,
  maxSelections,
  onActivate,
  onFocusChange
}: {
  companies: CompanyRegistryEntry[];
  selectedTickers: Ticker[];
  focusedTicker: Ticker;
  maxSelections: number;
  onActivate: (ticker: Ticker) => void;
  onFocusChange: (ticker: Ticker) => void;
}) {
  return (
    <div className="selector-block unified-company-selector">
      <div className="unified-selector-heading">
        <span className="selector-label">Compare companies · {selectedTickers.length}/{maxSelections}</span>
        <label className="focused-company-label">
          Details
          <select
            aria-label="Focused company details"
            value={focusedTicker}
            onChange={(event) => onFocusChange(event.target.value as Ticker)}
          >
            {companies.filter((entry) => selectedTickers.includes(entry.ticker)).map((entry) => (
              <option key={entry.ticker} value={entry.ticker}>{entry.selectorLabel}</option>
            ))}
          </select>
        </label>
      </div>
      <div>{companies.map((entry) => {
        const selected = selectedTickers.includes(entry.ticker);
        const focused = focusedTicker === entry.ticker;
        const requiredSelection = selected && selectedTickers.length === 1;
        const action = requiredSelection
          ? "keep selected because at least one company is required"
          : selected ? "remove from comparison" : "add to comparison and focus details";
        return (
          <button
            key={entry.ticker}
            type="button"
            className={`${selected ? "company-selected" : ""}${focused ? " company-focused" : ""}`.trim()}
            aria-pressed={selected}
            aria-label={`${entry.selectorLabel} ${selected ? "selected" : "not selected"}${focused ? ", focused for details" : ""}; click to ${action}`}
            disabled={requiredSelection}
            onClick={() => onActivate(entry.ticker)}
          >
            {entry.selectorLabel}
          </button>
        );
      })}</div>
    </div>
  );
}
