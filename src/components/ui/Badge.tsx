import type { ReactNode } from 'react';

import { cn } from '@/utils';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-content-secondary',
  accent: 'bg-accent-soft text-accent-hover',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
