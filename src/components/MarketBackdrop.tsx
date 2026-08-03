import type { BackdropTile } from "@/lib/market";

function formatTileValue(tile: BackdropTile): string {
  if (tile.value === null) return "—";
  switch (tile.unit) {
    case "$/MMBtu":
      return tile.value.toFixed(2);
    case "Bcf":
      return `${tile.value >= 0 ? "" : "-"}${Math.abs(tile.value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "MMBbl":
      return tile.value.toFixed(1);
    case "% wk/wk":
      return `${tile.value >= 0 ? "+" : ""}${tile.value.toFixed(1)}`;
    default:
      return tile.value.toLocaleString("en-US");
  }
}

const DELTA_COLOR: Record<BackdropTile["deltaDirection"], string> = {
  pos: "var(--pos)",
  neg: "var(--neg)",
  flat: "var(--text-faint)",
};

function Tile({ tile }: { tile: BackdropTile }) {
  return (
    <div className="flex flex-col gap-[3px] bg-panel px-4.5 py-3.5">
      <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-text-faint uppercase">{tile.label}</div>
      <div className="flex items-baseline gap-1.5 font-mono text-[19px] font-semibold text-white">
        {formatTileValue(tile)}
        <span className="text-[11px] font-normal text-text-dim">{tile.unit}</span>
      </div>
      <div className="font-mono text-[10.5px]" style={{ color: DELTA_COLOR[tile.deltaDirection] }}>
        {tile.deltaLabel ?? "—"}
      </div>
    </div>
  );
}

export function MarketBackdrop({ tiles }: { tiles: BackdropTile[] }) {
  return (
    <div className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Tile key={tile.label} tile={tile} />
      ))}
    </div>
  );
}
