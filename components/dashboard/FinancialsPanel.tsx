import { getQuarterlyFinancials, quarters } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

const latestQuarter = quarters[quarters.length - 1];
const priorYearQuarter = quarters[quarters.length - 1 - 4];

type Comparison = { text: string; tone: "positive" | "negative" | "neutral" };
type StatementRow = { label: string; value: string; comparison: Comparison };

function formatMillions(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

function yoyComparison(current: number | null, prior: number | null): Comparison {
  if (current === null || prior === null || prior === 0) return { text: "-- vs prior year", tone: "neutral" };
  const change = ((current - prior) / Math.abs(prior)) * 100;
  const sign = change > 0 ? "+" : "";
  return {
    text: `${sign}${change.toFixed(1)}% vs ${priorYearQuarter}`,
    tone: change > 0 ? "positive" : change < 0 ? "negative" : "neutral"
  };
}

function row(label: string, current: number | null, prior: number | null): StatementRow {
  return { label, value: formatMillions(current), comparison: yoyComparison(current, prior) };
}

function StatementSection({ title, rows }: { title: string; rows: StatementRow[] }) {
  return (
    <div className="financials-section">
      <h3>{title}</h3>
      <ul>
        {rows.map((item) => (
          <li key={item.label}>
            <span>{item.label}</span>
            <span className="financials-values">
              <strong>{item.value}</strong>
              <small className={item.comparison.tone}>{item.comparison.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinancialsPanel({ ticker }: { ticker: Ticker }) {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const priorFinancials = getQuarterlyFinancials(ticker, priorYearQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);
  const priorFreeCashFlow = getQuarterlyFreeCashFlow(ticker, priorYearQuarter);

  return (
    <div className="panel financials-panel">
      <div className="panel-head">
        <h2>Financials</h2>
        <span className="badge">{latestQuarter}</span>
      </div>

      <StatementSection
        title="Income statement"
        rows={[
          row("Revenue", financials.revenue.value, priorFinancials.revenue.value),
          row("EBITDAX", financials.adjustedEbitdax.value, priorFinancials.adjustedEbitdax.value),
          row("Net income", financials.netIncome?.value ?? null, priorFinancials.netIncome?.value ?? null)
        ]}
      />
      <StatementSection
        title="Cash flow statement"
        rows={[
          row("Operating cash flow", financials.operatingCashFlow?.value ?? null, priorFinancials.operatingCashFlow?.value ?? null),
          row("Capital expenditures", financials.capitalExpenditures.value, priorFinancials.capitalExpenditures.value),
          row("Free cash flow", freeCashFlow.value, priorFreeCashFlow.value)
        ]}
      />
      <StatementSection
        title="Balance sheet"
        rows={[
          row("Cash & equivalents", financials.cashAndEquivalents?.value ?? null, priorFinancials.cashAndEquivalents?.value ?? null),
          row("Total debt", financials.totalDebt?.value ?? null, priorFinancials.totalDebt?.value ?? null),
          row("Net debt", financials.netDebt.value, priorFinancials.netDebt.value)
        ]}
      />

      <p className="muted panel-note">
        Normalized company-filing data for {latestQuarter}, compared with {priorYearQuarter}. Unsupported statement lines display &quot;--&quot;.
      </p>
    </div>
  );
}
