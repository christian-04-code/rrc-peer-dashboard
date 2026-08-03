import { formatValue } from "@/lib/metrics";
import type { RankingRow } from "@/lib/overview";

const COLUMNS: { key: keyof Pick<RankingRow, "ebitdax" | "fcf" | "leverage" | "productionGrowth">; label: string; unit: string; signed?: boolean }[] = [
  { key: "ebitdax", label: "Adjusted EBITDAX", unit: "$mm" },
  { key: "fcf", label: "Free Cash Flow", unit: "$mm" },
  { key: "leverage", label: "Net Debt / LTM EBITDAX", unit: "x" },
  { key: "productionGrowth", label: "Production Growth (YoY)", unit: "%", signed: true },
];

export function RankingTable({ rows, title, subtitle }: { rows: RankingRow[]; title: string; subtitle: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-panel px-6.5 py-6 pb-5">
      <div className="mb-3.5">
        <h3 className="text-[14.5px] font-semibold text-white">{title}</h3>
        <div className="mt-0.5 font-mono text-[10.5px] text-text-faint">{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 text-left font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">Rank</th>
              <th className="px-2 py-2 text-left font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">Company</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2 text-right font-mono text-[10.5px] font-semibold tracking-[0.05em] text-text-faint uppercase">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ticker}
                className="border-b border-border/60 last:border-b-0"
                style={row.isRRC ? { background: "var(--blue-wash)" } : undefined}
              >
                <td className="px-2 py-2.5 font-mono text-[12px] text-text-faint">{row.rank ?? "—"}</td>
                <td className="px-2 py-2.5">
                  <span
                    className="font-mono text-[12.5px]"
                    style={{ color: row.isRRC ? "var(--blue-soft)" : "var(--text)", fontWeight: row.isRRC ? 700 : 500 }}
                  >
                    {row.ticker}
                  </span>
                  <span className="ml-2 hidden text-[11.5px] text-text-faint sm:inline">{row.name}</span>
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="px-2 py-2.5 text-right font-mono text-[12.5px]"
                    style={{ color: row.isRRC ? "var(--text)" : "var(--text-dim)", fontWeight: row.isRRC ? 600 : 400 }}
                  >
                    {formatValue(row[col.key], col.unit, { signed: col.signed })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3.5 font-mono text-[10px] text-text-faint">
        Ranked by Adjusted EBITDAX, descending. Source: historical.json. Dashes indicate data not reported — never estimated or zero-filled.
      </div>
    </div>
  );
}
