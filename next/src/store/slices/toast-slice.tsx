/**
 * store/slices/toast-slice.tsx
 *
 * App-wide toast notifications, rendered by <Toaster /> at the top of the
 * viewport. Each toast carries its own lifetime (default 6s, hard cap 10s);
 * the Toaster shows a circular countdown of the time left before it
 * disappears. Dismissal itself is driven by the Toaster component so the
 * countdown can pause while hovered.
 */

import { StateCreator } from 'zustand';
import type { AppStore } from '../index';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id:       string;
  message:  string;
  variant:  ToastVariant;
  /** total lifetime in ms — capped at MAX_TOAST_MS */
  duration: number;
}

export const DEFAULT_TOAST_MS = 6_000;
export const MAX_TOAST_MS     = 10_000;

export interface ToastSliceState {
  toasts: ToastItem[];
}

export interface ToastSliceActions {
  showToast:    (message: string, opts?: { variant?: ToastVariant; duration?: number }) => string;
  dismissToast: (id: string) => void;
}

export interface ToastSlice extends ToastSliceState, ToastSliceActions {}

let toastCounter = 0;

export const createToastSlice: StateCreator<
  AppStore,
  [['zustand/devtools', never], ['zustand/immer', never]],
  [],
  ToastSlice
> = (set) => ({
  toasts: [],

  showToast: (message, opts) => {
    const id = `toast_${Date.now()}_${toastCounter++}`;
    const duration = Math.min(opts?.duration ?? DEFAULT_TOAST_MS, MAX_TOAST_MS);
    set(s => {
      s.toasts.push({
        id,
        message,
        variant: opts?.variant ?? 'info',
        duration,
      });
      // Keep the stack shallow — oldest toast makes room for the newest.
      if (s.toasts.length > 3) s.toasts.shift();
    });
    return id;
  },

  dismissToast: (id) => {
    set(s => {
      s.toasts = s.toasts.filter(t => t.id !== id);
    });
  },
});
