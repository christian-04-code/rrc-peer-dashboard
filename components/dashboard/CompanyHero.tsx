import Image from "next/image";
import type { CompanyRegistryEntry } from "@/lib/dashboard/company-registry";

// EQT, EXE, and GPOR mark colors sit close in luminance to the dark panel
// background (or rely on transparent negative space) and lose legibility without
// a light backing. RRC's mark carries its own opaque blue fill and AR/CNX have
// enough contrast, so those render directly with no backing.
const LOGOS_REQUIRING_LIGHT_BACKING = new Set(["EQT", "EXE", "GPOR"]);

export function CompanyHero({ company, activity }: { company: CompanyRegistryEntry; activity: string }) {
  return (
    <div className="company-header">
      <div className="company-identity">
        <div className={LOGOS_REQUIRING_LIGHT_BACKING.has(company.ticker) ? "hero-logo hero-logo--boxed" : "hero-logo"}><Image src={company.logo} alt={company.logoAlt} fill sizes="36px" /></div>
        <div><h1>{company.shortName}</h1><p>{company.ticker} · {company.exchange}</p></div>
      </div>
      <div className="updated"><strong>{activity}</strong></div>
    </div>
  );
}
