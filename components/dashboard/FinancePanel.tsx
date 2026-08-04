import type { InsightRow } from "@/lib/dashboard/types";

export function FinancePanel({
  rows,
  onOpenDetail
}: {
  rows: InsightRow[];
  onOpenDetail: (summary: string) => void;
}) {
  const summary = rows.map((row) => row.text).join(" ");
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Guidance</h2>
      </div>
      <div className="insight-list">
        {rows.map((row) => (
          <div className="insight-row" key={row.label ?? row.text}>
            {row.label ? <b>{row.label}: </b> : null}
            {row.text}
          </div>
        ))}
      </div>
      <button onClick={() => onOpenDetail(summary)}>View full guidance →</button>
    </div>
  );
}
