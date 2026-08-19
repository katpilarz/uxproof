'use client';

/**
 * components/toaster.tsx
 *
 * Renders the toast stack from the toast slice at the top-center of the
 * viewport (above the top bar). Each toast:
 *   - confirms an action ("Conversation deleted", "Signed in as …")
 *   - shows a circular countdown of the time left before it auto-dismisses
 *     (lifetime is capped at 10s in the slice), with the seconds remaining
 *     inside the ring
 *   - pauses its countdown while hovered, and can be dismissed early by
 *     clicking the ring
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToasts, useDismissToast } from '@/store';
import type { ToastItem } from '@/store/slices/toast-slice';
import { cn } from '@/lib/utils';

const TICK_MS = 100;

const VARIANT_ICON = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
} as const;

const VARIANT_ICON_CLASS = {
  success: 'text-foreground',
  error:   'text-foreground',
  info:    'text-muted-foreground',
} as const;

function CountdownRing({
  remaining,
  duration,
  onClick,
}: {
  remaining: number;
  duration:  number;
  onClick:   () => void;
}) {
  const R = 8;
  const C = 2 * Math.PI * R;
  const fraction = Math.max(0, Math.min(1, remaining / duration));

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss notification"
      title="Dismiss"
      className="relative shrink-0 size-6 grid place-items-center rounded-full hover:bg-muted transition-colors"
    >
      <svg viewBox="0 0 20 20" className="absolute inset-0.5 -rotate-90" aria-hidden="true">
        <circle
          cx="10" cy="10" r={R}
          fill="none" strokeWidth="2"
          className="stroke-border"
        />
        <circle
          cx="10" cy="10" r={R}
          fill="none" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          className="stroke-foreground/60 transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      <span className="text-[8px] font-mono tabular-nums text-muted-foreground leading-none">
        {Math.ceil(remaining / 1000)}
      </span>
    </button>
  );
}

function Toast({ toast }: { toast: ToastItem }) {
  const dismissToast = useDismissToast();
  const [remaining, setRemaining] = useState(toast.duration);
  const pausedRef = useRef(false);

  // Tick the countdown. The store dismissal must NOT happen inside the
  // setState updater — updaters run during render, and updating the
  // Toaster from there triggers React's "cannot update a component while
  // rendering a different component" error. Expiry is handled by the
  // effect below instead.
  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      setRemaining(prev => Math.max(0, prev - TICK_MS));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [toast.id]);

  // Dismiss from an effect once the countdown reaches zero.
  useEffect(() => {
    if (remaining <= 0) dismissToast(toast.id);
  }, [remaining, toast.id, dismissToast]);

  const Icon = VARIANT_ICON[toast.variant];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      className={cn(
        'pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl',
        'bg-background border border-border shadow-lg shadow-black/10',
        'min-w-[240px] max-w-[min(92vw,420px)]',
      )}
    >
      <Icon className={cn('size-4 shrink-0', VARIANT_ICON_CLASS[toast.variant])} />
      <p className="flex-1 text-sm text-foreground leading-snug">{toast.message}</p>
      <CountdownRing
        remaining={remaining}
        duration={toast.duration}
        onClick={() => dismissToast(toast.id)}
      />
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToasts();

  return (
    <div
      aria-label="Notifications"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(t => <Toast key={t.id} toast={t} />)}
      </AnimatePresence>
    </div>
  );
}
