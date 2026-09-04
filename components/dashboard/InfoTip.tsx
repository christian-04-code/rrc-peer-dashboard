"use client";

/**
 * Shared hover/focus info tooltip -- a small, dependency-free copy of the
 * pattern `components/forecast/RrcScenarioWorkbench.tsx` already
 * established (that component's own `InfoTip` is a private, unexported
 * function; duplicated here rather than refactoring that working file, per
 * Phase 7E's own "do not refactor unrelated systems" scope). Pure CSS
 * hover/:focus-within, no JS state -- keyboard-focusable via a real
 * `<button>`, so it satisfies "hover and keyboard focus accessible"
 * without a click. Reuses the exact `.info-tip*` classes already defined
 * in `components/dashboard/ForecastPanel.css` (imported globally in
 * app/layout.tsx), so no new CSS file is needed for the base look; a
 * `wide` prop adds one small additive modifier class for tooltips whose
 * copy is longer than the default 300px max-width was sized for.
 */

type TooltipPlacement = "top" | "bottom";

export function InfoTip({
  text,
  placement = "bottom",
  align = "left",
  wide = false
}: {
  text: string;
  placement?: TooltipPlacement;
  align?: "center" | "left";
  wide?: boolean;
}) {
  const classNames = ["info-tip", `info-tip--${placement}`, align === "left" ? "info-tip--left" : "", wide ? "info-tip--wide" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classNames}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={text}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        i
      </button>
      <span className="info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
