import { cn } from '@/utils';

export type View = 'assistant' | 'email' | 'bulk' | 'settings';

const NAV: Array<{ id: View; label: string }> = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'email', label: 'Email' },
  { id: 'bulk', label: 'Bulk' },
  { id: 'settings', label: 'Settings' },
];

/** Compact logo mark: gradient tile with the SideRep monogram. */
function LogoMark() {
  return (
    <div className="relative flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-muted shadow-sm">
      <span className="text-[11px] font-bold tracking-tight text-white">SR</span>
      <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
    </div>
  );
}

export function Header({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-edge bg-surface-1/80 px-3.5 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-content-primary">SideRep</span>
          <span className="mt-0.5 text-[10px] font-medium text-content-muted">Sales Assistant</span>
        </div>
      </div>

      <nav
        className="flex items-center gap-0.5 rounded-lg border border-edge bg-surface-2/60 p-0.5"
        aria-label="Main"
      >
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150',
              view === item.id
                ? 'bg-surface-3 text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
