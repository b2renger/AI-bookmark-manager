import { create } from 'zustand';
import type { ToastItem, ToastKind } from '@cairn/ui';

// Toasts hold i18n *keys*, never sentences: the store has no `t` and the locale can change
// while a toast is on screen.

let seq = 0;

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, key: string, params?: Record<string, unknown>, detail?: string) => string;
  info: (key: string, params?: Record<string, unknown>) => string;
  success: (key: string, params?: Record<string, unknown>) => string;
  error: (key: string, detail?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const AUTO_DISMISS_MS = 5000;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (kind, key, params, detail) => {
    const id = `toast-${++seq}`;
    const toast: ToastItem = {
      id,
      kind,
      key,
      ...(params === undefined ? {} : { params }),
      ...(detail === undefined ? {} : { detail }),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (kind !== 'error') {
      setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
    }
    return id;
  },

  info: (key, params) => get().push('info', key, params),
  success: (key, params) => get().push('success', key, params),
  error: (key, detail) => get().push('error', key, undefined, detail),

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
