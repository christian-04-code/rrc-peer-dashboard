/**
 * Shared "$MM" formatter for range-company-adapter.ts / peers-adapter.ts /
 * forecast-adapter.ts (previously three byte-identical copies). A real
 * Preview PDF showed a negative value (CRK's Q2 2026 FCF) render as
 * "$-211MM" -- the minus sign landed after the dollar sign instead of
 * before it, since `value.toLocaleString()` already includes its own "-"
 * and the template just appended it after a literal "$". Fixed to the
 * standard financial-report convention, sign before the currency symbol:
 * "-$211MM".
 */
export function moneyDisplay(value: number | null): string {
  if (value === null) return "--";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}MM`;
}
