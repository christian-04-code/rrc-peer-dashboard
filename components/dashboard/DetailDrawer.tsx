import { useEffect, useRef, type RefObject } from "react";
import type { GuidanceDrawerContent } from "@/lib/dashboard/guidance";

export type DrawerContent = string | GuidanceDrawerContent;

function isGuidanceDrawerContent(content: DrawerContent): content is GuidanceDrawerContent {
  return typeof content === "object" && content.kind === "guidance";
}

export function DetailDrawer({
  content,
  onClose,
  closeButtonRef
}: {
  content: DrawerContent | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement>;
}) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const drawerNode = drawerRef.current;
    if (!content || !drawerNode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = drawerNode.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    drawerNode.addEventListener("keydown", onKeyDown);
    return () => drawerNode.removeEventListener("keydown", onKeyDown);
  }, [content]);

  if (!content) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(event) => event.stopPropagation()}>
        <button ref={closeButtonRef} onClick={onClose}>Close</button>
        {isGuidanceDrawerContent(content) ? (
          <>
            <h2 id="drawer-title">{content.ticker} · Full Guidance</h2>
            <p className="muted drawer-source">
              Source: {content.meta.source.replace(/^.*\//, "")} · {content.meta.generated}
            </p>
            <div className="guidance-sections">
              {content.sections.map((section) => (
                <section className="guidance-section" key={section.section}>
                  <h3>{section.section}</h3>
                  <div className="guidance-rows">
                    {section.rows.map((row, index) =>
                      row.kind === "pair" ? (
                        <div className="guidance-row" key={index}>
                          <span className="guidance-label">{row.label}</span>
                          <span className="guidance-value">{row.value}</span>
                        </div>
                      ) : (
                        <p className="guidance-row-note" key={index}>{row.text}</p>
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 id="drawer-title">Detail drawer</h2>
            <p>{content}</p>
            <p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p>
          </>
        )}
      </aside>
    </div>
  );
}
