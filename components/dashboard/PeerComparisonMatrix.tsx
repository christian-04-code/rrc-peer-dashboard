import { Fragment, memo, useMemo } from "react";
import { getCompanyColor } from "@/lib/dashboard/company-colors";
import { getActivePeerMetricRow, getPeerComparisonMatrix } from "@/lib/dashboard/peer-comparison-metrics";
import type { Metric, Ticker } from "@/lib/dashboard/types";

export const PeerComparisonMatrix = memo(function PeerComparisonMatrix({ selectedTickers, metric }: { selectedTickers: Ticker[]; metric: Metric }) {
  const matrix = useMemo(() => getPeerComparisonMatrix(selectedTickers), [selectedTickers]);
  const activeRow = getActivePeerMetricRow(metric);

  return (
    <section className="peer-matrix" aria-labelledby="peer-matrix-title">
      <div className="peer-matrix-head">
        <div>
          <span id="peer-matrix-title">Peer Comparison Matrix</span>
          <small>Latest supported reported and calculated metrics</small>
        </div>
        <small>Values show source period</small>
      </div>
      <div className="peer-matrix-scroll" tabIndex={0} aria-label="Scrollable peer comparison matrix">
        <table style={{ minWidth: `${180 + matrix.tickers.length * 116}px` }}>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {matrix.tickers.map((ticker) => (
                <th scope="col" key={ticker} style={{ borderTopColor: getCompanyColor(ticker) }}>{ticker}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.groups.map((group) => (
              <Fragment key={group.label}>
                <tr className="peer-matrix-group">
                  <th colSpan={matrix.tickers.length + 1} scope="rowgroup">{group.label}</th>
                </tr>
                {group.rows.map((row) => {
                  const isActive = row.key === activeRow;
                  return (
                    <tr key={row.key} className={isActive ? "peer-matrix-row active" : "peer-matrix-row"} aria-current={isActive ? "true" : undefined}>
                      <th scope="row"><span>{row.label}</span><small>{row.unit}</small></th>
                      {matrix.tickers.map((ticker) => {
                        const cell = row.values[ticker];
                        return (
                          <td key={ticker} className={cell.value === null ? "unsupported" : undefined}>
                            <span>{cell.displayValue}</span>
                            <small>{cell.period ?? "Unsupported"}</small>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
