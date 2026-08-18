/**
 * components/ai-processing-state.tsx
 *
 * NOTE: This component is now only shown DURING processing, never after.
 * The chat-interface no longer renders this on completed messages —
 * the stale "Analyzing…" badges are gone because the component is
 * only rendered while `isProcessing` is true.
 *
 * If you still want to show a "processing type" badge on finished messages,
 * use a simple static badge instead of this animated spinner component.
 */

import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AIProcessingState({
  type,
}: {
  type: 'upload' | 'analysis' | 'comparison' | 'presentation';
}) {
  // This is only rendered while processing is active.
  // Steps shown are purely informational — they don't represent real step states.
  const stepsMap: Record<typeof type, string[]> = {
    analysis: [
      'Querying Sanity CMS data…',
      'Extracting KPIs and metric signals…',
      'Generating executive intelligence…',
    ],
    comparison: [
      'Loading historical data…',
      'Comparing metrics across periods…',
      'Building analysis report…',
    ],
    presentation: [
      'Retrieving report data…',
      'Generating slide content…',
      'Applying PAISAK4U branding…',
    ],
    upload: [
      'Processing uploaded data…',
    ],
  };

  const steps = stepsMap[type] || stepsMap.analysis;

  return (
    <div className="space-y-1.5 py-0.5">
      {steps.map((label, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className={cn(
            'size-4 rounded flex items-center justify-center flex-shrink-0',
            idx === 0
              ? 'bg-violet-500/10'
              : 'bg-muted',
          )}>
            {idx === 0 ? (
              <Loader2 className="size-2.5 animate-spin text-violet-500" />
            ) : (
              <div className="size-1.5 rounded-sm bg-muted-foreground/30" />
            )}
          </div>
          <span className={cn(
            'text-xs',
            idx === 0 ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Static processing type badge — shown on COMPLETED messages only.
 * Replace AIProcessingState in completed message bubbles with this.
 */
export function ProcessingTypeBadge({
  type,
}: {
  type: 'analysis' | 'comparison' | 'presentation';
}) {
  const labels = {
    analysis:     '📊 AI Analysis',
    comparison:   '↔ Comparison',
    presentation: '📑 Presentation',
  };

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
      {labels[type]}
    </span>
  );
}