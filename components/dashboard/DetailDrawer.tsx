import type { RefObject } from "react";

export function DetailDrawer({
  content,
  onClose,
  closeButtonRef
}: {
  content: string | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement>;
}) {
  if (!content) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(event) => event.stopPropagation()}>
        <button ref={closeButtonRef} onClick={onClose}>Close</button>
        <h2 id="drawer-title">Detail drawer</h2>
        <p>{content}</p>
        <p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p>
      </aside>
    </div>
  );
}
