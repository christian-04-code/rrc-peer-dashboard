import { quarters } from "@/lib/dashboard/financials-quarterly";
import { getHistoricalCompletenessSummary } from "@/lib/dashboard/historical-completeness";

export function SourcesPanel() {
  const completeness = getHistoricalCompletenessSummary();
  const tickerCoverage = Object.entries(completeness.byTicker);

  return (
    <section className="sources-panel" aria-labelledby="sources-title">
      <div className="sources-hero">
        <div>
          <span className="sources-eyebrow">Audit trail</span>
          <h1 id="sources-title">Source inventory and methodology</h1>
          <p>
            The dashboard preserves reported values, derivation status, and methodology notes at the cell level.
            Unsupported historical values remain blank.
          </p>
        </div>
        <div className="sources-coverage">
          <strong>{quarters.length}</strong>
          <span>standalone quarters</span>
          <small>{quarters[0]} through {quarters[quarters.length - 1]}</small>
        </div>
      </div>

      <div className="sources-grid">
        <article className="source-card source-card-primary">
          <span className="source-priority">Priority 1</span>
          <h2>Company filings and reported materials</h2>
          <p>
            Quarterly values were assembled from company 10-Qs, 10-Ks, earnings releases, and supplemental materials.
            SEC filings control when reported sources conflict.
          </p>
          <ul>
            <li>Company-isolated research</li>
            <li>Standalone quarterly values</li>
            <li>No unsupported historical estimates</li>
          </ul>
        </article>

        <article className="source-card">
          <span className="source-priority">Normalized fixture</span>
          <h2>Quarterly peer dataset</h2>
          <p><code>lib/dashboard/financials-quarterly.ts</code></p>
          <p>
            Every populated value carries a source tag, an actual/derived basis, and an optional preserved methodology note.
          </p>
        </article>

        <article className="source-card">
          <span className="source-priority">Coverage audit</span>
          <h2>{completeness.coveragePct.toFixed(1)}% populated</h2>
          <p>{completeness.populated.toLocaleString()} of {completeness.total.toLocaleString()} official historical metric cells currently contain verified values.</p>
          <ul>
            {tickerCoverage.map(([ticker, summary]) => (
              <li key={ticker}>{ticker}: {summary.coveragePct.toFixed(1)}% · {summary.missing} blank</li>
            ))}
          </ul>
        </article>

        <article className="source-card">
          <span className="source-priority">Fallback discipline</span>
          <h2>FactSet workbook</h2>
          <p>
            FactSet is retained as a lower-priority per-cell fallback. It is not used to overwrite filing-supported values or
            convert ambiguous zeroes into reported data.
          </p>
        </article>

        <article className="source-card source-card-warning">
          <span className="source-priority">Comparability warning</span>
          <h2>Definitions vary across peers</h2>
          <p>
            Capital expenditures, total cash costs, and well activity are not uniformly defined. The dashboard exposes these
            differences rather than silently forcing comparability.
          </p>
        </article>
      </div>

      <section className="methodology-panel">
        <h2>Historical-data controls</h2>
        <div className="methodology-grid">
          <div><strong>Missing value</strong><span>Rendered as “--”; never replaced with zero.</span></div>
          <div><strong>Actual</strong><span>Directly reported or filed by the company.</span></div>
          <div><strong>Derived</strong><span>Calculated only from sourced values with a defined methodology.</span></div>
          <div><strong>Guidance</strong><span>Kept separate from historical actuals.</span></div>
        </div>
      </section>
    </section>
  );
}
