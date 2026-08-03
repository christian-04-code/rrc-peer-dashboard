import type { DataClassification } from "@/lib/types";

const BADGE_STYLES: Record<DataClassification, { bg: string; color: string; label: string }> = {
  "Company-Reported Historical (Actual)": {
    bg: "rgba(47,190,140,0.14)",
    color: "var(--pos)",
    label: "Actual",
  },
  "Consensus Estimate": {
    bg: "rgba(154,110,220,0.14)",
    color: "#B79CE8",
    label: "Consensus",
  },
  "Company Guidance": {
    bg: "var(--blue-wash)",
    color: "var(--blue-soft)",
    label: "Guidance",
  },
};

export function Badge({ classification }: { classification: DataClassification }) {
  const style = BADGE_STYLES[classification];
  return (
    <span
      className="whitespace-nowrap rounded-[3px] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.04em] uppercase"
      style={{ background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}
