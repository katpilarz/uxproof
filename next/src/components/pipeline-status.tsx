'use client';

import { CheckCircle2, Circle, Loader2, XCircle, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface PipelineStep {
  agent:       string;
  status:      StepStatus;
  duration_ms: number | null;
  error:       string | null;
  metadata:    Record<string, unknown>;
}

interface PipelineStatusProps {
  steps:      Record<string, PipelineStep>;
  summary?:   string;
  className?: string;
}

const AGENT_LABELS: Record<string, string> = {
  context:    'Context Agent   — fetching Sanity data',
  extraction: 'Extraction Agent — Qwen3 intelligence',
  planning:   'Planning Agent  — slide plan generation',
};

const StatusIcon = ({ status }: { status: StepStatus }) => {
  switch (status) {
    case 'running':   return <Loader2  className="size-4 text-foreground animate-spin" />;
    case 'completed': return <CheckCircle2 className="size-4 text-foreground" />;
    case 'failed':    return <XCircle  className="size-4 text-foreground" />;
    case 'skipped':   return <SkipForward  className="size-4 text-muted-foreground/50" />;
    default:          return <Circle   className="size-4 text-muted-foreground/30" />;
  }
};

export function PipelineStatus({ steps, summary, className }: PipelineStatusProps) {
  return (
    <div className={cn('space-y-1 py-1', className)}>
      {Object.entries(steps).map(([key, step]) => (
        <div
          key={key}
          className={cn(
            'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors',
            step.status === 'running'   && 'bg-muted',
            step.status === 'completed' && 'bg-muted/50',
            step.status === 'failed'    && 'bg-muted/50',
          )}
        >
          <StatusIcon status={step.status} />
          <span
            className={cn(
              'flex-1 font-mono',
              step.status === 'skipped' ? 'text-muted-foreground/40 line-through' : 'text-foreground',
            )}
          >
            {AGENT_LABELS[key] ?? key}
          </span>
          {step.duration_ms && (
            <span className="text-muted-foreground/60 tabular-nums">
              {(step.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
{typeof step.metadata?.confidence === 'number' && (
  <span className="text-muted-foreground/60">
    {Math.round(step.metadata.confidence * 100)}% conf
  </span>
)}
        </div>
      ))}
      {summary && (
        <p className="mt-2 px-2 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
          {summary}
        </p>
      )}
    </div>
  );
}