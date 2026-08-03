"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview", enabled: true },
  { href: "/map", label: "Map", enabled: false },
  { href: "/financials", label: "Financials", enabled: false },
  { href: "/production", label: "Production", enabled: false },
  { href: "/pricing", label: "Pricing", enabled: false },
  { href: "/costs-capital", label: "Costs & Capital", enabled: false },
  { href: "/forecast", label: "Forecast", enabled: true },
  { href: "/valuation", label: "Valuation", enabled: true },
  { href: "/sources", label: "Sources", enabled: false },
];

export function SiteHeader() {
  const activeHref = usePathname();
  return (
    <header className="flex items-center justify-between border-b border-border bg-panel px-5 py-4 sm:px-8">
      <div className="flex items-center gap-3.5">
        <Image src="/logos/RRC.png" alt="Range Resources" width={120} height={30} className="h-[26px] w-auto sm:h-[30px]" priority />
        <div className="hidden h-[22px] w-px bg-border sm:block" />
        <div className="hidden font-display text-[15px] font-semibold tracking-[0.01em] text-text-dim sm:block">
          Peer <span className="text-text">Intelligence</span>
        </div>
      </div>
      <nav className="flex flex-wrap justify-end gap-0.5">
        {NAV_ITEMS.map((item) =>
          item.enabled ? (
            <Link
              key={item.href}
              href={item.href}
              className={
                item.href === activeHref
                  ? "rounded-md px-3.5 py-2 text-[13px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(0,129,198,0.4)]"
                  : "rounded-md px-3.5 py-2 text-[13px] font-medium text-text-dim transition-colors hover:bg-panel-alt hover:text-text"
              }
              style={item.href === activeHref ? { background: "var(--blue-wash)" } : undefined}
            >
              {item.label}
            </Link>
          ) : (
            <span
              key={item.href}
              className="cursor-not-allowed rounded-md px-3.5 py-2 text-[13px] font-medium text-text-faint"
              title="Not yet built"
            >
              {item.label}
            </span>
          ),
        )}
      </nav>
    </header>
  );
}
