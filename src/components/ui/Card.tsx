import type { ReactNode } from 'react';

import { cn } from '@/utils';

export interface CardProps {
  title?: string;
  /** Optional icon shown to the left of the title. */
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Removes the body padding (e.g. for scroll areas that manage their own). */
  flush?: boolean;
}

export function Card({ title, icon, action, children, className, flush = false }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-edge bg-surface-1 shadow-sm md:rounded-2xl',
        'transition-colors duration-150',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-3.5 pb-1.5 pt-3 md:px-5 md:pt-4">
          <div className="flex items-center gap-1.5">
            {icon && <span className="text-content-muted">{icon}</span>}
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {title}
            </h2>
          </div>
          {action}
        </header>
      )}
      <div
        className={cn(
          !flush && 'px-3.5 pb-3.5 pt-2 md:px-5 md:pb-5 md:pt-3',
          flush && 'flex min-h-0 flex-1 flex-col',
        )}
      >
        {children}
      </div>
    </section>
  );
}
