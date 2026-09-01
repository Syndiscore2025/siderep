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
function LogoMark({ web }: { web: boolean }) {
  return (
    <div
      className={cn(
        'flex size-8 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-inset ring-white/5',
        web && 'md:size-10',
      )}
    >
      <img
        src="/icons/icon-128.png"
        alt=""
        className={cn('size-7 rounded-lg', web && 'md:size-9')}
      />
    </div>
  );
}

export function Header({
  view,
  onNavigate,
  platform = 'extension',
}: {
  view: View;
  onNavigate: (view: View) => void;
  platform?: 'extension' | 'web';
}) {
  const web = platform === 'web';
  return (
    <header
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-edge bg-surface-1/85 px-3.5 py-2.5 backdrop-blur-xl',
        web && 'md:px-6 md:py-3',
      )}
    >
      <div className="flex items-center gap-2.5">
        <LogoMark web={web} />
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              'text-sm font-semibold tracking-tight text-content-primary',
              web && 'md:text-base',
            )}
          >
            SideRep
          </span>
          <span className="mt-1 text-[10px] font-medium text-content-muted">Sales workspace</span>
        </div>
        {web && (
          <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2.5 py-1 text-[10px] font-semibold text-success lg:flex">
            <span className="size-1.5 rounded-full bg-success" />
            Private workspace
          </span>
        )}
      </div>

      <nav
        className={cn(
          'flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-edge bg-surface-2/60 p-0.5',
          web && 'w-full md:w-auto md:rounded-xl md:p-1',
        )}
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
              web && 'flex-1 md:flex-none md:rounded-lg md:px-4 md:py-2',
              view === item.id
                ? 'bg-surface-3 text-content-primary shadow-sm ring-1 ring-inset ring-white/5'
                : 'text-content-secondary hover:bg-surface-3/50 hover:text-content-primary',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
