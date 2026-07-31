import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/utils';

import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-accent to-accent-muted text-white shadow-sm ring-1 ring-inset ring-white/10 hover:from-accent-hover hover:to-accent',
  secondary:
    'border border-edge bg-surface-2 text-content-primary shadow-sm hover:border-edge-strong hover:bg-surface-3',
  ghost: 'text-content-secondary hover:bg-surface-2 hover:text-content-primary',
  danger:
    'border border-transparent bg-danger-soft text-danger hover:border-danger/40 hover:bg-danger hover:text-white',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-150',
        'active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : icon}
      {children}
    </button>
  );
}
