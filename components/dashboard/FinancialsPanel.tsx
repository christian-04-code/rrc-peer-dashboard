import { getQuarterlyFinancials, quarters } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

const latestQuarter = quarters[quarters.length - 1];

type StatementRow = { label: string; value: string };

function formatMillions(value: number | null): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}

function StatementSection({ title, rows }: { title: string; rows: StatementRow[] }) {
  return (
    <div className="financials-section">
      <h3>{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FinancialsPanel({ ticker }: { ticker: Ticker }) {
  const financials = getQuarterlyFinancials(ticker, latestQuarter);
  const freeCashFlow = getQuarterlyFreeCashFlow(ticker, latestQuarter);

  return (
    <div className="panel financials-panel">
      <div className="panel-head">
        <h2>Financials</h2>
        <span className="badge">{latestQuarter}</span>
      </div>

      <StatementSection
        title="Income statement"
        rows={[
          { label: "Revenue", value: formatMillions(financials.revenue.value) },
          { label: "EBITDAX", value: formatMillions(financials.adjustedEbitdax.value) },
          { label: "Net income", value: "--" }
        ]}
      />
      <StatementSection
        title="Cash flow statement"
        rows={[
          { label: "Operating cash flow", value: "--" },
          { label: "Capital expenditures", value: formatMillions(financials.capitalExpenditures.value) },
          { label: "Free cash flow", value: formatMillions(freeCashFlow.value) }
        ]}
      />
      <StatementSection
        title="Balance sheet"
        rows={[
          { label: "Cash", value: "--" },
          { label: "Total debt", value: "--" },
          { label: "Net debt", value: formatMillions(financials.netDebt.value) }
        ]}
      />

      <p className="muted panel-note">Normalized company-filing data for {latestQuarter}. Unsupported statement lines display &quot;--&quot;.</p>
    </div>
  );
}
