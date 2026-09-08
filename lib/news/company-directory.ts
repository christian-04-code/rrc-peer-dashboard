import rawCompanyRegistry from "@/config/companies.json";
import type { Ticker } from "@/lib/dashboard/company-registry";

export type NewsCompanyIdentity = {
  ticker: Ticker;
  name: string;
  shortName: string;
  cik: string | null;
};

/**
 * config/companies.json (not lib/dashboard/company-registry.ts) is the
 * identity source of truth this module reuses. company-registry.ts is a
 * UI-oriented wrapper that also eagerly imports each company's logo image;
 * the news domain has no need for logos, so re-deriving the same
 * displayOrder/ui.enabled selection here (identical logic, same underlying
 * JSON) avoids pulling image assets into server-only news code.
 */
export const NEWS_COMPANY_DIRECTORY: NewsCompanyIdentity[] = (rawCompanyRegistry.displayOrder as string[])
  .map((ticker) => ticker as Ticker)
  .filter((ticker) => (rawCompanyRegistry.companies as Record<string, { ui: { enabled: boolean } }>)[ticker]?.ui?.enabled)
  .map((ticker) => {
    const company = (rawCompanyRegistry.companies as Record<string, { name: string; shortName: string; sec?: { cik?: string } }>)[ticker];
    return { ticker, name: company.name, shortName: company.shortName, cik: company.sec?.cik ?? null };
  });
