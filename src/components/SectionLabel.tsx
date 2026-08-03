export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.1em] text-text-dim uppercase">
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
