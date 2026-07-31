import type { ReactNode } from 'react';

/** Labeled form row used across the Settings page. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-content-secondary">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-content-muted">{hint}</span>}
    </label>
  );
}
