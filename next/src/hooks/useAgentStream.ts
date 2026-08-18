/**
 * hooks/useAgentStream.ts
 *
 * Consumes the SSE stream from POST /api/agents/stream and exposes
 * real-time pipeline state to any React component.
 *
 * Usage:
 *   const { steps, status, summary, error, start, reset } = useAgentStream();
 *   await start({ task, context, agents });
 */

'use client';

import { useCallback, useRef, useState } from 'react';

// ─── Types (mirrors Python PipelineState) ─────────────────────────────────────

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AgentStep {
  agent:       string;
  status:      AgentStatus;
  started_at:  string | null;
  finished_at: string | null;
  duration_ms: number | null;
  output_keys: string[];
  error:       string | null;
  metadata:    Record<string, unknown>;
}

export type StreamEventType =
  | 'tool_start'
  | 'tool_done'
  | 'pipeline_complete'
  | 'pipeline_error';

export interface StreamEvent {
  event:       StreamEventType;
  pipeline_id: string;
  status:      AgentStatus;
  steps:       Record<string, AgentStep>;
  summary:     string;
  error:       string | null;
}

export interface UseAgentStreamOptions {
  onComplete?: (event: StreamEvent) => void;
  onError?:   (event: StreamEvent) => void;
  onStep?:    (event: StreamEvent) => void;
}

export interface StartStreamParams {
  task:    string;
  context: Record<string, unknown>;
  agents:  string[];
}

export interface AgentStreamState {
  pipelineId: string | null;
  status:     AgentStatus;
  steps:      Record<string, AgentStep>;
  summary:    string;
  error:      string | null;
  isStreaming: boolean;
}

const INITIAL_STATE: AgentStreamState = {
  pipelineId: null,
  status:     'pending',
  steps:      {},
  summary:    '',
  error:      null,
  isStreaming: false,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [state, setState] = useState<AgentStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const start = useCallback(
    async (params: StartStreamParams): Promise<StreamEvent | null> => {
      // Cancel any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL_STATE,
        isStreaming: true,
        status: 'running',
      });

      let lastEvent: StreamEvent | null = null;

      try {
        const res = await fetch('/api/agents/stream', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(params),
          signal:  controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Stream request failed: ${res.status} ${res.statusText}`);
        }

        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        let   buffer  = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const event: StreamEvent = JSON.parse(raw);
              lastEvent = event;

              setState((prev) => ({
                ...prev,
                pipelineId: event.pipeline_id,
                status:     event.status,
                steps:      event.steps,
                summary:    event.summary,
                error:      event.error,
                isStreaming: event.event !== 'pipeline_complete' && event.event !== 'pipeline_error',
              }));

              if (event.event === 'tool_start' || event.event === 'tool_done') {
                options.onStep?.(event);
              }

              if (event.event === 'pipeline_complete') {
                setState((prev) => ({ ...prev, isStreaming: false }));
                options.onComplete?.(event);
              }

              if (event.event === 'pipeline_error') {
                setState((prev) => ({ ...prev, isStreaming: false }));
                options.onError?.(event);
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return null;
        const message = err instanceof Error ? err.message : String(err);
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          status: 'failed',
          error: message,
        }));
      }

      return lastEvent;
    },
    [options],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  return { ...state, start, reset, abort };
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function getStepLabel(agent: string): string {
  const labels: Record<string, string> = {
    context:    'Loading enterprise data',
    extraction: 'Extracting executive intelligence',
    planning:   'Building slide structure',
  };
  return labels[agent] ?? agent;
}

export function getStepIcon(status: AgentStatus): string {
  switch (status) {
    case 'running':   return '⟳';
    case 'completed': return '✓';
    case 'failed':    return '✗';
    case 'skipped':   return '—';
    default:          return '○';
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}