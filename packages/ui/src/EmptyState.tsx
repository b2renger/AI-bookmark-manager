import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Already translated by the caller. */
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
    >
      {icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-accent">
          {icon}
        </span>
      ) : null}
      <h2 className="text-base font-semibold text-fg-1">{title}</h2>
      {description ? <p className="max-w-md text-sm text-fg-3">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
