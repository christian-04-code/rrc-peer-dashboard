import { getCompany } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

export function MapWorkspace({ ticker, comparisonTickers, onOpen }: { ticker: Ticker; comparisonTickers: Ticker[]; onOpen: (value: string) => void }) {
  const company = getCompany(ticker);
  return <div className="map-area"><div className="map-toolbar"><div><h2>U.S. energy exposure map</h2><p>{company.primaryRegion} · {company.primaryBasin} · default view: {company.defaultMapView}</p></div><div><button>Basins</button><button>Routes</button><button>LNG</button><button>Demand</button></div></div><div className="map-placeholder"><span className="basin appalachia" onClick={() => onOpen(`${ticker} Appalachian exposure detail`)}>Appalachia</span><span className="basin haynesville" onClick={() => onOpen(`${ticker} Haynesville exposure detail`)}>Haynesville</span><span className="basin permian" onClick={() => onOpen(`${ticker} Permian exposure detail`)}>Permian</span><i className="route one"/><i className="route two"/><strong>{ticker} selected · peers: {comparisonTickers.length ? comparisonTickers.join(", ") : "none"}</strong></div><p>Placeholder only. Claude must replace this schematic with authoritative geographic geometry and verified company exposure data.</p></div>;
}
