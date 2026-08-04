import { marketRibbon } from "@/lib/dashboard/homepage-data";

const MACRO_KEYS = new Set(["henry_hub", "wti", "ngl", "appalachia_basis"]);

export function MacroPanel() {
  const macroItems = marketRibbon.filter((item) => MACRO_KEYS.has(item.key));
  return (
    <div className="macro-panel">
      <div className="macro-market">
        <h2>Market context</h2>
        <div className="macro-market-grid">
          {macroItems.map((item) => (
            <div className="macro-market-card" key={item.key}>
              <span>{item.label}</span>
              <strong>{item.displayValue}</strong>
              <em>{item.change}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="macro-section">
        <h2>EIA storage</h2>
        <p className="muted">Normalized adapter pending.</p>
      </div>

      <div className="macro-section">
        <h2>Electric demand</h2>
        <p className="muted">Normalized adapter pending.</p>
      </div>
    </div>
  );
}
