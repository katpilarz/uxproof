'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Step {
  id:    string;
  label: string;
  state: 'pending' | 'active' | 'done';
}

interface AIThinkingPanelProps {
  queryType?:   string;
  isStreaming?:  boolean;
  streamSteps?:  Record<string, { status?: string; duration_ms?: number }>;
  className?:    string;
}

const STEP_SEQUENCES: Record<string, { id: string; label: string }[]> = {
  presentation: [
    { id: 'context',    label: 'Retrieving data from Sanity CMS…'     },
    { id: 'extraction', label: 'Extracting research intelligence…'    },
    { id: 'planning',   label: 'Planning 8-slide narrative structure…' },
    { id: 'generating', label: 'Applying template layout…'     },
  ],
  analysis: [
    { id: 'context',    label: 'Querying research database…'            },
    { id: 'processing', label: 'Analysing KPIs and performance signals…' },
    { id: 'insights',   label: 'Compiling research insights…'           },
  ],
  comparison: [
    { id: 'context',    label: 'Loading period data…'                    },
    { id: 'compare',    label: 'Computing period-over-period deltas…'    },
    { id: 'insights',   label: 'Summarising key differences…'            },
  ],
  default: [
    { id: 'thinking',   label: 'Processing your request…'                },
    { id: 'data',       label: 'Retrieving relevant data…'               },
  ],
};

// Stable default — an inline `{}` default would be a fresh object every
// render, which re-runs the timer effect below on each parent re-render
// and stalls the simulated step ladder.
const NO_STREAM_STEPS: Record<string, { status?: string; duration_ms?: number }> = {};

export function AIThinkingPanel({
  queryType   = 'default',
  isStreaming  = false,
  streamSteps  = NO_STREAM_STEPS,
  className    = '',
}: AIThinkingPanelProps) {
  const sequence = STEP_SEQUENCES[queryType] ?? STEP_SEQUENCES.default;
  const [visible, setVisible] = useState(1);
  const [active,  setActive]  = useState(0);

  useEffect(() => {
    if (isStreaming && Object.keys(streamSteps).length > 0) return;

    const timings = [900, 1800, 2900, 4200];
    const timers: ReturnType<typeof setTimeout>[] = [];

    sequence.forEach((_, i) => {
      if (i === 0) return;
      const t = setTimeout(() => {
        setVisible(i + 1);
        setActive(i);
      }, timings[i] ?? timings[timings.length - 1]);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [sequence, isStreaming, streamSteps]);

  const steps: Step[] = sequence.map((step, i) => {
    const ss = streamSteps[step.id];
    if (ss) {
      return {
        ...step,
        state:
          ss.status === 'completed' ? 'done'
          : ss.status === 'running' ? 'active'
          : 'pending',
      };
    }
    if (i < active)                return { ...step, state: 'done'    as const };
    if (i === active && i < visible) return { ...step, state: 'active' as const };
    return { ...step, state: 'pending' as const };
  });

  const visibleSteps = isStreaming
    ? steps.filter(s => s.state !== 'pending' || streamSteps[s.id])
    : steps.slice(0, visible);

  return (
    <div className={`px-4 py-3 ${className} w-full`}>
      {/* Header — monochrome, matching your UI */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-black dark:text-white">
          Processing request
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        <AnimatePresence>
          {visibleSteps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3"
            >
              <StepDot state={step.state} />

              <span className={`text-[13px] leading-snug transition-colors duration-300 ${
                step.state === 'done'
                  ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                  : step.state === 'active'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground/50'
              }`}>
                {step.label}
              </span>

              {step.state === 'done' && streamSteps[step.id]?.duration_ms && (
                <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono tabular-nums shrink-0">
                  {((streamSteps[step.id].duration_ms ?? 0) / 1000).toFixed(1)}s
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Step dot — solid active state, checked done (monochrome) ──────────────────

function StepDot({ state }: { state: Step['state'] }) {
  if (state === 'done') {
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1,   opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="size-4 rounded-full bg-foreground/15 dark:bg-foreground/20 flex items-center justify-center shrink-0"
      >
        <svg className="size-2.5 text-foreground" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>
    );
  }

  if (state === 'active') {
    return (
      <div className="size-4 shrink-0 relative flex items-center justify-center">
        {/* Monochrome ping — matches your primary color */}
        <span className="absolute size-4 rounded-full bg-foreground/30 dark:bg-foreground/20 animate-ping" />
        <span className="relative size-2.5 rounded-full bg-foreground" />
      </div>
    );
  }

  return (
    <div className="size-4 shrink-0 flex items-center justify-center">
      <span className="size-2 rounded-full border border-border bg-transparent" />
    </div>
  );
}