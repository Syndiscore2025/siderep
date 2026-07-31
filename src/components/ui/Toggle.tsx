import { cn } from '@/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Accessible switch used for per-field approval and boolean settings. */
export function Toggle({ checked, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'inline-block size-3.5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
