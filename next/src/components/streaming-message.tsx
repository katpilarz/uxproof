'use client';

/**
 * components/streaming-message.tsx
 *
 * KEY FIX: If content is empty when isStreaming=true mounts, the component
 * previously showed nothing forever. Now it falls through to MarkdownMessage
 * immediately once content arrives, and handles the empty-on-mount case.
 *
 * Also: if isStreaming=true but content is already fully populated (e.g. the
 * message was pushed after the API returned), start the ticker immediately
 * rather than waiting for a re-render.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkdownMessage } from './markdown-message';

interface StreamingMessageProps {
  content:     string;
  isStreaming?: boolean;
  onComplete?: () => void;
  className?:  string;
}

const CHARS_PER_TICK = 6;   // slightly faster — content arrives all at once
const TICK_MS        = 12;

export function StreamingMessage({
  content,
  isStreaming = false,
  onComplete,
  className,
}: StreamingMessageProps) {
  // If not streaming or content already present — start fully revealed
  const [displayed, setDisplayed] = useState(() =>
    !isStreaming || !content ? content : ''
  );
  const posRef     = useRef(isStreaming && content ? 0 : content.length);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef(content);

  // Keep ref in sync so tick() always sees latest content
  contentRef.current = content;

  const tick = useCallback(() => {
    const full  = contentRef.current;
    if (!full) {
      // Content not yet populated — stop ticking and show nothing
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const chars = CHARS_PER_TICK + Math.floor(Math.random() * 3);
    posRef.current = Math.min(posRef.current + chars, full.length);
    setDisplayed(full.slice(0, posRef.current));

    if (posRef.current >= full.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    // Not streaming — show full content immediately
    if (!isStreaming) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setDisplayed(content);
      posRef.current = content.length;
      return;
    }

    // Streaming but content empty — wait; tick will restart when content arrives
    if (!content) return;

    // Streaming with content — start ticker if not already running
    if (!timerRef.current) {
      posRef.current = Math.min(posRef.current, content.length);
      timerRef.current = setInterval(tick, TICK_MS);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, content, tick]);

  // Safety: if streaming ended but display is still partial, snap to full
  useEffect(() => {
    if (!isStreaming && displayed !== content) {
      setDisplayed(content);
      posRef.current = content.length;
    }
  }, [isStreaming, content]); // eslint-disable-line

  // CRITICAL FIX: if content exists but displayed is empty (race on mount),
  // and isStreaming has already ended — render full content immediately
  if (!displayed && content && !isStreaming) {
    return (
      <div className={className}>
        <MarkdownMessage content={content} />
      </div>
    );
  }

  return (
    <div className={className}>
      <MarkdownMessage content={displayed || ''} />
      {isStreaming && displayed.length > 0 && (
        <span
          className="inline-block w-[2px] h-[13px] ml-0.5 align-text-bottom rounded-full bg-violet-500 dark:bg-violet-400 animate-blink"
          aria-hidden="true"
        />
      )}
    </div>
  );
}