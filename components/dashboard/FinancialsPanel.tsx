import type { InsightRow } from "@/lib/dashboard/types";

export function FinancialsPanel({ rows }: { rows: InsightRow[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Financials</h2>
        <button disabled title="Full quarterly history — coming soon">Expand</button>
      </div>
      <div className="insight-list">
        {rows.map((row) => (
          <div className="insight-row" key={row.label ?? row.text}>
            {row.label ? <b>{row.label}: </b> : null}
            {row.text}
          </div>
        ))}
      </div>
      <p className="muted panel-note">Full quarterly history — coming soon</p>
    </div>
  );
}
