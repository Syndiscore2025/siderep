import { cn } from '@/utils';

export type View = 'assistant' | 'email' | 'bulk' | 'renewal' | 'settings';

const NAV: Array<{ id: View; label: string }> = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'email', label: 'Email' },
  { id: 'bulk', label: 'Bulk' },
  { id: 'renewal', label: 'Renewal' },
  { id: 'settings', label: 'Settings' },
];

/** Compact brand mark shared with the extension toolbar and store listing. */
function LogoMark() {
  return <img src="/icons/icon-128.png" alt="" className="size-7 rounded-lg shadow-sm" />;
}

export function Header({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-edge bg-surface-1/80 px-3.5 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-content-primary">SideRep</span>
          <span className="mt-0.5 text-[10px] font-medium text-content-muted">Sales Assistant</span>
        </div>
      </div>

      <nav
        className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-edge bg-surface-2/60 p-0.5"
        aria-label="Main"
      >
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150',
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
