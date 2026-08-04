import type { InsightRow } from "@/lib/dashboard/types";

export function IntelligencePanel({ rows, onOpenDetail }: { rows: InsightRow[]; onOpenDetail: (summary: string) => void }) {
  const summary = rows.map((row) => row.text).join(" ");
  return (
    <div className="panel">
      <h2>Today’s intelligence</h2>
      <div className="insight-list">
        {rows.map((row) => (
          <div className="insight-row" key={row.label ?? row.text}>
            {row.label ? <b>{row.label}: </b> : null}
            {row.text}
          </div>
        ))}
      </div>
      <button onClick={() => onOpenDetail(summary)}>Explore supporting data →</button>
    </div>
  );
}
