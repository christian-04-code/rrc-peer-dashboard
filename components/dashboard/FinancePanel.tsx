import type { FinancePanelTab, InsightRow } from "@/lib/dashboard/types";

export function FinancePanel({
  tab,
  onTabChange,
  rows,
  onOpenDetail
}: {
  tab: FinancePanelTab;
  onTabChange: (tab: FinancePanelTab) => void;
  rows: InsightRow[];
  onOpenDetail: (summary: string) => void;
}) {
  const summary = rows.map((row) => row.text).join(" ");
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{tab === "guidance" ? "Guidance" : "Financials"}</h2>
        <div className="panel-toggle" role="group" aria-label="Guidance or financials view">
          <button className={tab === "guidance" ? "active" : ""} aria-pressed={tab === "guidance"} onClick={() => onTabChange("guidance")}>Guidance</button>
          <button className={tab === "financials" ? "active" : ""} aria-pressed={tab === "financials"} onClick={() => onTabChange("financials")}>Financials</button>
        </div>
      </div>
      <div className="insight-list">
        {rows.map((row) => (
          <div className="insight-row" key={row.label ?? row.text}>
            {row.label ? <b>{row.label}: </b> : null}
            {row.text}
          </div>
        ))}
      </div>
      <button onClick={() => onOpenDetail(summary)}>View full {tab === "guidance" ? "guidance" : "financials"} →</button>
    </div>
  );
}
