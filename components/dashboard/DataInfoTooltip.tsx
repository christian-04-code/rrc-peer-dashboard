"use client";

/**
 * Reusable "data details" tooltip for Macro section headers and chart cards
 * -- the structured counterpart to components/dashboard/InfoTip.tsx (which
 * takes one plain string). Reuses the exact same `.info-tip*` hover/focus
 * CSS and accessibility pattern (a real, keyboard-focusable `<button>` plus
 * a `role="tooltip"` bubble shown via CSS `:hover`/`:focus-within`, already
 * defined in ForecastPanel.css and imported globally) rather than inventing
 * a second tooltip system, per this pass's explicit "reuse the existing
 * convention" instruction. Only additive CSS (`.info-tip-bubble--data`,
 * `.info-tip-fields`, etc.) was added, not a parallel component.
 *
 * Every field is optional and only rendered when present -- this component
 * never fabricates a Source/Series/Observation/Retrieved value; callers
 * pass through whatever the underlying data object already carries (e.g.
 * NormalizedMarketMetric.seriesId/period/fetchedAt/frequency), same as the
 * always-visible metadata lines already did before this pass.
 */

export type DataInfoField = { label: string; value: string | null | undefined };

export function DataInfoTooltip({
  fields = [],
  methodology,
  caveat,
  placement = "bottom",
  align = "left"
}: {
  fields?: DataInfoField[];
  methodology?: string;
  caveat?: string;
  placement?: "top" | "bottom";
  align?: "center" | "left";
}) {
  const visibleFields = fields.filter((field): field is { label: string; value: string } => Boolean(field.value));
  if (visibleFields.length === 0 && !methodology && !caveat) return null;

  const ariaLabel = [
    "Data details.",
    ...visibleFields.map((field) => `${field.label}: ${field.value}.`),
    methodology ? `Methodology: ${methodology}` : "",
    caveat ?? ""
  ].filter(Boolean).join(" ");

  const classNames = ["info-tip", `info-tip--${placement}`, align === "left" ? "info-tip--left" : "", "info-tip--wide"].filter(Boolean).join(" ");

  return (
    <span className={classNames}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={ariaLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        i
      </button>
      <span className="info-tip-bubble info-tip-bubble--data" role="tooltip">
        {visibleFields.length > 0 ? (
          <dl className="info-tip-fields">
            {visibleFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {methodology ? <p className="info-tip-methodology"><b>Methodology</b> {methodology}</p> : null}
        {caveat ? <p className="info-tip-caveat">{caveat}</p> : null}
      </span>
    </span>
  );
}
