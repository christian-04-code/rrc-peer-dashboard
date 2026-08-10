import { getCompanyGuidanceHighlights, getCompanyGuidanceFullText, getGuidanceMeta } from "@/lib/dashboard/guidance";
import type { Ticker } from "@/lib/dashboard/types";

export function GuidancePanel({
  ticker,
  onOpenDetail
}: {
  ticker: Ticker;
  onOpenDetail: (summary: string) => void;
}) {
  const highlights = getCompanyGuidanceHighlights(ticker);
  const meta = getGuidanceMeta();

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Guidance</h2>
        <span className="badge">{ticker}</span>
      </div>

      {highlights.length === 0 ? (
        <p className="muted">No normalized company guidance is available for {ticker}.</p>
      ) : (
        <div className="insight-list">
          {highlights.map((item) => (
            <div className="insight-row" key={`${item.section}-${item.label}`}>
              <b>{item.label}: </b>
              {item.value}
            </div>
          ))}
        </div>
      )}

      {highlights.length > 0 ? (
        <button onClick={() => onOpenDetail(getCompanyGuidanceFullText(ticker))}>View full guidance →</button>
      ) : null}

      <p className="muted panel-note">
        Company guidance · {meta.source.replace(/^.*\//, "")} · {meta.generated}
      </p>
    </div>
  );
}
