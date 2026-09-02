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
  // The hint sits outside the <label> so it never becomes part of the
  // control's accessible name.
  return (
    <div className="block">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-content-secondary">{label}</span>
        {children}
      </label>
      {hint && <span className="mt-1 block text-[11px] text-content-muted">{hint}</span>}
    </div>
  );
}
