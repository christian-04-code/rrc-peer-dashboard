import type { StaticImageData } from "next/image";
import rawRegistry from "@/config/companies.json";
import rrcLogo from "@/assets/logos/RRC.png";
import arLogo from "@/assets/logos/AR.png";
import cnxLogo from "@/assets/logos/CNX.png";
import crkLogo from "@/assets/logos/CRK.png";
import eqtLogo from "@/assets/logos/EQT.png";
import exeLogo from "@/assets/logos/EXE.png";
import gporLogo from "@/assets/logos/GPOR.svg";

export type Ticker = keyof typeof rawRegistry.companies;

export type CompanyRegistryEntry = {
  ticker: Ticker;
  name: string;
  shortName: string;
  exchange: string;
  description: string;
  selectorLabel: string;
  logo: StaticImageData | string;
  logoAlt: string;
  primaryRegion: string;
  primaryBasin: string;
  productFocus: string[];
  defaultMapView: string;
  exposureKeys: string[];
  routeLayerKeys: string[];
  dataAvailability: {
    historical: boolean;
    guidance: boolean;
    consensus: boolean;
    market: boolean;
  };
};

const logoByTicker: Record<Ticker, StaticImageData | string> = {
  RRC: rrcLogo,
  AR: arLogo,
  CNX: cnxLogo,
  CRK: crkLogo,
  EQT: eqtLogo,
  EXE: exeLogo,
  GPOR: gporLogo
};

function buildEntry(ticker: Ticker): CompanyRegistryEntry {
  const company = rawRegistry.companies[ticker];
  return {
    ticker,
    name: company.name,
    shortName: company.shortName,
    exchange: company.exchange,
    description: company.ui.description,
    selectorLabel: company.ui.selectorLabel,
    logo: logoByTicker[ticker],
    logoAlt: company.logo.alt,
    primaryRegion: company.business.primaryRegion,
    primaryBasin: company.business.primaryBasin,
    productFocus: [...company.business.productFocus],
    defaultMapView: company.map.defaultView,
    exposureKeys: [...company.map.exposureKeys],
    routeLayerKeys: [...company.map.routeLayerKeys],
    dataAvailability: {
      historical: company.data.historicalEnabled,
      guidance: company.data.guidanceEnabled,
      consensus: company.data.consensusEnabled,
      market: company.data.marketEnabled
    }
  };
}

export const defaultTicker = rawRegistry.defaultCompany as Ticker;

export const selectableCompanies: CompanyRegistryEntry[] = rawRegistry.displayOrder
  .map((ticker) => ticker as Ticker)
  .filter((ticker) => rawRegistry.companies[ticker].ui.enabled)
  .map(buildEntry);

export const companiesByTicker = Object.fromEntries(
  selectableCompanies.map((company) => [company.ticker, company])
) as Record<Ticker, CompanyRegistryEntry>;

export function getCompany(ticker: Ticker): CompanyRegistryEntry {
  const company = companiesByTicker[ticker];
  if (!company) {
    throw new Error(`Unknown or disabled company ticker: ${ticker}`);
  }
  return company;
}

export function isTicker(value: string): value is Ticker {
  return value in companiesByTicker;
}
