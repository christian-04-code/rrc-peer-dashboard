import { useEffect, useRef, type RefObject } from "react";

export function DetailDrawer({
  content,
  onClose,
  closeButtonRef
}: {
  content: string | null;
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
        <h2 id="drawer-title">Detail drawer</h2>
        <p>{content}</p>
        <p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p>
      </aside>
    </div>
  );
}
