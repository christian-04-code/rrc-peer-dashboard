import { marketRibbon } from "@/lib/dashboard/homepage-data";

export function MarketRibbon({ onOpen }: { onOpen: (value: string) => void }) {
  return (
    <section className="market-ribbon" aria-label="Mock live market ribbon">
      {marketRibbon.map((item) => (
        <button key={item.key} onClick={() => onOpen(`${item.label}: ${item.status} market context, timestamp, range, and source details.`)}>
          <span>{item.label}</span><strong>{item.displayValue}</strong><em>{item.change}</em>
        </button>
      ))}
    </section>
  );
}
