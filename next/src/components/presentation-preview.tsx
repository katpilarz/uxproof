'use client';

/**
 * components/presentation-preview.tsx — v3 (auto-start)
 *
 * CHANGES OVER v2:
 *   Generation now starts automatically when the preview mounts for a
 *   FRESH assistant message (`autoStart` prop, decided by chat-interface)
 *   — the user no longer has to press "Generate" after already asking
 *   for a presentation in chat. A module-level guard set (keyed by
 *   `messageId`) makes the trigger fire at most once per message, even
 *   across remounts. Restored history sessions pass autoStart={false},
 *   so old messages never fire background generations.
 *
 *   While generating, the card shows the step-by-step AI pipeline
 *   progress (AIThinkingPanel, 'presentation' sequence) plus a live
 *   elapsed-seconds counter, instead of a bare spinner line.
 *
 * v2 behaviour retained — body resolution order (most specific first):
 *     1. reportId → { reportId, period }
 *     2. explicit scope='year' + year → { scope:'year', year, period }
 *     3. explicit quarter+year       → { scope:'quarter', quarter, year, period }
 *     4. parsed from period — "Q3 2024" → quarter+year, "Full Year 2025" → year-scope
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Layers, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import { AIThinkingPanel } from './ai-thinking-panel';

// Message ids whose generation has already been auto-triggered this page
// load — survives component remounts (layout animations, session switches)
// so a message can never fire two background generations.
const autoStartedMessages = new Set<string>();

interface PresentationPreviewProps {
  downloadUrl?:  string;
  reportId?:     string;     // ← preferred: stable Sanity reportId
  period?:       string;     // ← e.g. "Q3 2024" or "Full Year 2025"
  scope?:        'quarter' | 'year';  // ← forwarded from message.presentationScope
  year?:         number;     // ← forwarded from message.year
  quarter?:      string;     // ← forwarded from message.quarter
  slideCount?:   number;
  className?:    string;
  autoStart?:    boolean;    // ← start generating on mount (fresh messages only)
  messageId?:    string;     // ← guard key for the one-shot auto trigger
  // Kept for backwards compatibility, but no longer sent to the API:
  slidePlan?:    unknown;
  intelligence?: unknown;
}

type GenState = 'idle' | 'generating' | 'ready' | 'downloading' | 'error';

// A representative strip of the Dossier template, not a promise of the
// deck's contents: slide presence follows the data, so the real deck is
// only known once it is built. Ground tiles for content slides, violet
// for the cover plate and section dividers.
const GROUND = 'bg-[#F3F2F2] border border-zinc-300 dark:border-zinc-600';
const VIOLET = 'bg-[#6D4AF5]';

interface SlideTile { n: number; label: string; bg: string; txt: string }

/** What the API reports a built deck contains. */
interface SlideSummary { kind: string; label: string; tone: 'violet' | 'ground' }

const tile = (n: number, label: string, tone: 'violet' | 'ground'): SlideTile => ({
  n, label,
  bg:  tone === 'violet' ? VIOLET : GROUND,
  txt: tone === 'violet' ? 'text-white/80' : 'text-zinc-500',
});

// Shown BEFORE generating, when the deck does not exist yet: a
// representative strip, not a promise. Once the deck is built the API
// reports what it actually contains and that replaces this.
const TEMPLATE_STRIP: SlideTile[] = [
  tile(1, 'Cover',             'violet'),
  tile(2, 'Contents',          'ground'),
  tile(3, 'Executive summary', 'ground'),
  tile(4, 'Study at a glance', 'ground'),
  tile(5, 'Section',           'violet'),
  tile(6, 'Finding',           'ground'),
  tile(7, 'Findings summary',  'violet'),
  tile(8, 'Recommendations',   'ground'),
];

function parseQuarterPeriod(period: string): { quarter: string; year: number } | null {
  const m = period.match(/(Q[1-4])\s+(\d{4})/i);
  if (!m) return null;
  return { quarter: m[1].toUpperCase(), year: parseInt(m[2], 10) };
}

function parseYearPeriod(period: string): { year: number } | null {
  const m = period.match(/\b(20\d{2})\b/);
  if (!m) return null;
  return { year: parseInt(m[1], 10) };
}

function isYearScopePeriod(period: string): boolean {
  if (/Q[1-4]/i.test(period)) return false;
  if (/full year/i.test(period)) return true;
  if (/\b20\d{2}\b/.test(period)) return true;
  return false;
}

export function PresentationPreview({
  downloadUrl: initialUrl,
  reportId,
  period = 'Executive Report',
  scope,
  year,
  quarter,
  slideCount,
  className = '',
  autoStart = false,
  messageId,
}: PresentationPreviewProps) {
  const [genState, setGenState] = useState<GenState>(initialUrl ? 'ready' : 'idle');
  const [url,      setUrl]      = useState(initialUrl ?? '');
  const [error,    setError]    = useState('');
  const [count,    setCount]    = useState(slideCount ?? 0);
  /** The deck the API actually built; empty until it has been generated. */
  const [built,    setBuilt]    = useState<SlideTile[]>([]);
  const [elapsed,  setElapsed]  = useState(0);
  const autoFired = useRef(false);

  // The ready card must never pop in instantly: even when the deck comes
  // back in <1s (plan already cached in Sanity), the user should see the
  // pipeline steps play out before the download button appears. The
  // AIThinkingPanel 'presentation' sequence finishes its 4th step at
  // ~4.2s — hold 'generating' at least this long.
  const MIN_GENERATING_MS = 5200;

  function buildRequestBody() {
    const body: Record<string, unknown> = { title: period, period };

    if (reportId) {
      body.reportId = reportId;
      return body;
    }

    let effectiveScope:   'quarter' | 'year' | undefined = scope;
    let effectiveYear:    number | undefined             = year;
    let effectiveQuarter: string | undefined             = quarter;

    if (!effectiveScope) {
      effectiveScope = isYearScopePeriod(period) ? 'year' : 'quarter';
    }

    if (effectiveScope === 'year') {
      if (effectiveYear === undefined) {
        const parsed = parseYearPeriod(period);
        if (parsed) effectiveYear = parsed.year;
      }
      if (effectiveYear !== undefined) {
        body.scope = 'year';
        body.year  = effectiveYear;
      }
    } else {
      if (effectiveQuarter === undefined || effectiveYear === undefined) {
        const parsed = parseQuarterPeriod(period);
        if (parsed) {
          effectiveQuarter = effectiveQuarter ?? parsed.quarter;
          effectiveYear    = effectiveYear    ?? parsed.year;
        }
      }
      if (effectiveQuarter && effectiveYear !== undefined) {
        body.scope   = 'quarter';
        body.quarter = effectiveQuarter;
        body.year    = effectiveYear;
      }
    }

    return body;
  }

  async function handleGenerate() {
    setGenState('generating');
    setError('');
    const startedAt = Date.now();

    try {
      const requestBody = buildRequestBody();
      console.log('[presentation-preview] POST /api/presentations', requestBody);

      const res = await fetch('/api/presentations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const ct   = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : {};
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/vnd.openxmlformats')) {
        const blob   = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setUrl(objUrl);
        setCount(8);
      } else {
        const data = await res.json();
        setUrl(data.downloadUrl);
        setCount(data.slidesCount ?? 0);
        const summary: SlideSummary[] = Array.isArray(data.slides) ? data.slides : [];
        setBuilt(summary.map((sl, i) => tile(i + 1, sl.label, sl.tone)));
      }
      // Let the pipeline steps finish playing before revealing the deck.
      const remaining = MIN_GENERATING_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
      setGenState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }

  // Auto-start generation for fresh assistant messages — the user already
  // asked for the deck in chat, so asking for a second click is redundant.
  // Guarded per-message so remounts and re-renders never double-fire.
  useEffect(() => {
    if (!autoStart || autoFired.current) return;
    if (genState !== 'idle' || url) return;
    if (messageId && autoStartedMessages.has(messageId)) return;
    autoFired.current = true;
    if (messageId) autoStartedMessages.add(messageId);
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Elapsed-seconds ticker while the pipeline runs (can take 1–2 min
  // with the full agent orchestration).
  useEffect(() => {
    if (genState !== 'generating') { setElapsed(0); return; }
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [genState]);

  const handleDownload = useCallback(async () => {
    if (!url) return;

    const filename = `${period.replace(/\s+/g, '_')}_UX_Report.pptx`;

    if (url.startsWith('/downloads/') || url.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      return;
    }

    setGenState('downloading');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob   = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href       = objUrl;
      a.download   = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
      setGenState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }, [url, period]);

  const SlideGrid = () => (
    <div className="grid grid-cols-4 gap-1.5 my-3">
      {(built.length ? built : TEMPLATE_STRIP).map(slide => (
        <div
          key={slide.n}
          className={`relative aspect-[16/9] rounded overflow-hidden ${slide.bg}`}
          title={slide.label}
        >
          <span className={`absolute top-0.5 left-1 text-[7px] opacity-60 font-mono ${slide.txt}`}>
            {String(slide.n).padStart(2, '0')}
          </span>
          <span className={`absolute bottom-0.5 left-1 right-1 text-[7px] font-medium leading-tight truncate ${slide.txt}`}>
            {slide.label}
          </span>
        </div>
      ))}
    </div>
  );

  if ((genState === 'ready' || genState === 'downloading') && url) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border border-border bg-card p-4 space-y-3 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate text-foreground">{period}</h4>
            <p className="text-xs text-muted-foreground">{count} slides · Dossier template</p>
          </div>
          <Badge variant="secondary" className="gap-1 shrink-0">
            <Check className="size-3 text-emerald-500" />
            Ready
          </Badge>
        </div>

        <SlideGrid />

        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={genState === 'downloading'}
            className="gap-1.5 text-xs"
          >
            {genState === 'downloading'
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Download className="size-3.5" />
            }
            {genState === 'downloading' ? 'Downloading…' : 'Download .pptx'}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">Research template</span>
        </div>
      </motion.div>
    );
  }

  if (genState === 'generating') {
    // Reasoning-first: while the pipeline runs, the card shows ONLY the
    // step-by-step thinking panel (chat-bubble treatment). The slide grid
    // is revealed when the deck flips to 'ready'.
    return (
      <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
        <div className="flex items-center gap-3 p-4 pb-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-foreground truncate">{period}</h4>
            <p className="text-xs text-muted-foreground">Building your research deck…</p>
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
            {elapsed}s
          </span>
          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
        </div>
        {/* Live pipeline steps — same treatment as the chat thinking bubble */}
        <div className="border-t border-border bg-muted/30">
          <AIThinkingPanel queryType="presentation" />
        </div>
      </div>
    );
  }

  if (genState === 'error') {
    return (
      <div className={`rounded-xl border border-destructive/30 bg-card p-4 space-y-3 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive break-words flex-1">{error}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate} className="gap-2 text-xs">
          <RefreshCw className="size-3.5" />
          Retry generation
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-border bg-card p-4 space-y-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate text-foreground">{period}</h4>
          <p className="text-xs text-muted-foreground">
            Dossier template · slides follow your data
          </p>
        </div>
      </div>

      <SlideGrid />

      <div className="border-t border-border pt-2">
        <Button
          size="sm"
          onClick={handleGenerate}
          className="w-full gap-2 text-xs"
        >
          <Download className="size-3.5" />
          Generate &amp; download .pptx
        </Button>
      </div>
    </motion.div>
  );
}