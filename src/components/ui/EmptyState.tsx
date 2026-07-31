import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
      {icon && <div className="mb-1 text-content-muted">{icon}</div>}
      <p className="text-sm font-medium text-content-primary">{title}</p>
      {description && <p className="max-w-60 text-xs text-content-muted">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
