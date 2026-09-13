import { AlertCircleIcon, CheckIcon, CloseIcon, InfoIcon } from './icons/index.js';
import type { TFn } from './types.js';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  /** i18n key, resolved here — stores hold keys, not sentences. */
  key: string;
  params?: Record<string, unknown>;
  /** Raw technical detail (an error message from main); never translated. */
  detail?: string;
}

const TONE: Record<ToastKind, string> = {
  info: 'border-line-2 bg-surface-2 text-fg-1',
  success: 'border-ok/40 bg-ok/10 text-fg-1',
  error: 'border-danger/50 bg-danger/10 text-fg-1',
};

const ICON: Record<ToastKind, typeof InfoIcon> = {
  info: InfoIcon,
  success: CheckIcon,
  error: AlertCircleIcon,
};

export interface ToastProps {
  t: TFn;
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function Toast({ t, toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toasts"
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = ICON[toast.kind];
        return (
          <div
            key={toast.id}
            data-testid="toast"
            data-kind={toast.kind}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${TONE[toast.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{t(toast.key, toast.params)}</p>
              {toast.detail ? (
                <p className="mt-0.5 break-all font-mono text-[11px] text-fg-3">{toast.detail}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={t('common.dismiss')}
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 text-fg-3 hover:bg-surface-3 hover:text-fg-1"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
