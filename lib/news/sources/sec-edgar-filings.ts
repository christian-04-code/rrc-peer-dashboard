import { NEWS_COMPANY_DIRECTORY } from "@/lib/news/company-directory";
import type { RawArticle } from "@/lib/news/types";
import { withinLookback, type CollectOptions, type NewsSourceAdapter } from "@/lib/news/sources/types";

const NEWSWORTHY_FORMS = new Set(["8-K", "8-K/A"]);

type SecSubmissionsResponse = {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
    };
  };
};

function buildFilingUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const archiveCik = cik.replace(/^0+/, "") || "0";
  const archiveAccession = accessionNumber.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${archiveCik}/${archiveAccession}/${primaryDocument}`;
}

/**
 * Tier 1: SEC EDGAR submissions API, filtered to 8-K ("material event")
 * filings for every company already in config/companies.json -- reuses the
 * registry's CIKs directly rather than a second hardcoded company/CIK list.
 * Verified working: https://data.sec.gov/submissions/CIK0000315852.json
 * returns 200 with a declared, descriptive User-Agent (SEC EDGAR's fair
 * access policy rejects generic/blank User-Agent headers).
 */
export class SecEdgarFilingsAdapter implements NewsSourceAdapter {
  readonly id = "sec-edgar-8k";
  readonly tier = "tier1_primary" as const;
  readonly label = "SEC EDGAR (8-K filings)";

  private readonly userAgent: string;

  constructor(userAgent?: string) {
    const declared = userAgent ?? process.env.SEC_USER_AGENT;
    if (!declared) {
      throw new Error("SEC_USER_AGENT is not set. SEC EDGAR requires a declared, descriptive User-Agent for automated requests.");
    }
    this.userAgent = declared;
  }

  async collect(options: CollectOptions): Promise<RawArticle[]> {
    const articles: RawArticle[] = [];

    for (const company of NEWS_COMPANY_DIRECTORY) {
      const cik = company.cik;
      if (!cik) continue;

      const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        throw new Error(`SEC submissions request for CIK ${cik} failed: ${response.status}`);
      }

      const payload = (await response.json()) as SecSubmissionsResponse;
      const recent = payload.filings?.recent;
      if (!recent?.form) continue;

      const count = recent.form.length;
      for (let index = 0; index < count && articles.length < options.maxArticles; index += 1) {
        const form = recent.form[index];
        if (!NEWSWORTHY_FORMS.has(form)) continue;

        const filingDate = recent.filingDate?.[index];
        const accessionNumber = recent.accessionNumber?.[index];
        const primaryDocument = recent.primaryDocument?.[index];
        if (!filingDate || !accessionNumber || !primaryDocument) continue;

        const publishedAt = new Date(`${filingDate}T00:00:00Z`).toISOString();
        if (!withinLookback(publishedAt, options.lookbackHours)) continue;

        articles.push({
          sourceId: this.id,
          sourceTier: this.tier,
          headline: `${company.name} files Form ${form}`,
          url: buildFilingUrl(cik, accessionNumber, primaryDocument),
          publisher: "U.S. Securities and Exchange Commission (EDGAR)",
          publishedAt,
          excerpt: `${company.name} (${company.ticker}) filed Form ${form} with the SEC on ${filingDate}.`
        });
      }
    }

    return articles;
  }
}
