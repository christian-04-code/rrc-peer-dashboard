import type { Metric, Ticker } from "@/lib/dashboard/types";

export function ChartWorkspace({ comparisonTickers, title, metric }: { comparisonTickers: Ticker[]; title: string; metric: Metric }) {
  const peerPaths = [
    "M70 205 C180 198 250 184 330 170 S490 146 570 132 S665 120 715 108",
    "M70 220 C180 205 250 200 330 182 S490 165 570 145 S665 135 715 122",
    "M70 190 C180 186 250 177 330 162 S490 154 570 138 S665 127 715 118",
    "M70 235 C180 226 250 217 330 204 S490 178 570 158 S665 145 715 136",
    "M70 198 C180 190 250 178 330 165 S490 140 570 126 S665 116 715 105",
    "M70 214 C180 208 250 198 330 188 S490 160 570 148 S665 134 715 125"
  ];
  const axisUnit = metric === "production" ? "Bcfe/d" : "";
  return (
    <div className="chart-area">
      <div><h2>{title}</h2><p>Primary company with up to six selected peer overlays · solid = historical, dashed = forecast</p></div>
      <svg viewBox="0 0 760 300" role="img" aria-label={`${title} mock chart. Historical actuals shown solid through Q1'26, forecast shown dashed through 2027E.`}>
        <g className="grid-lines">
          <line x1="55" y1="50" x2="730" y2="50"/>
          <line x1="55" y1="115" x2="730" y2="115"/>
          <line x1="55" y1="180" x2="730" y2="180"/>
          <line x1="55" y1="245" x2="730" y2="245"/>
        </g>
        <g className="axis-labels">
          {axisUnit ? <text className="axis-unit" x="18" y="30">{axisUnit}</text> : null}
          <text className="y-axis-label" x="48" y="54">2.7</text>
          <text className="y-axis-label" x="48" y="119">2.5</text>
          <text className="y-axis-label" x="48" y="184">2.3</text>
          <text className="y-axis-label" x="48" y="249">2.1</text>
          <text className="x-axis-label" x="70" y="268" textAnchor="middle">Q1&apos;25</text>
          <text className="x-axis-label" x="330" y="268" textAnchor="middle">Q1&apos;26</text>
          <text className="x-axis-label" x="570" y="268" textAnchor="middle">Q3&apos;26E</text>
          <text className="x-axis-label" x="715" y="268" textAnchor="middle">2027E</text>
        </g>
        <path className="primary-line" d="M70 230 C180 220 250 210 330 195"/>
        <path className="primary-line forecast-line" d="M330 195 C410 180 490 150 570 110 C650 70 665 78 715 62"/>
        {comparisonTickers.map((peer, index) => <path key={peer} className={`peer-line peer-${index + 1}`} d={peerPaths[index]} />)}
        <circle className="forecast-pulse-ring" cx="715" cy="62" r="6"/>
        <circle cx="715" cy="62" r="6"/>
      </svg>
      <div className="chart-legend"><span className="primary-legend">Primary</span>{comparisonTickers.map((peer) => <span key={peer}>{peer}</span>)}</div>
    </div>
  );
}
