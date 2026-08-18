'use client';

/**
 * components/presentation-preview.tsx — v2
 *
 * CHANGES OVER v1:
 *   New optional props: `scope`, `year`, `quarter`. When the parent message
 *   carries `presentationScope === 'year'` from unified-agent, the preview
 *   now POSTs `{ scope: 'year', year }` to /api/presentations instead of
 *   trying to parse a Q-token out of "Full Year 2025" (which fails silently
 *   and produces the empty default deck).
 *
 *   Body resolution order (most specific first):
 *     1. reportId → { reportId, period }
 *     2. explicit scope='year' + year → { scope:'year', year, period }
 *     3. explicit quarter+year       → { scope:'quarter', quarter, year, period }
 *     4. parsed from period — "Q3 2024" → quarter+year, "Full Year 2025" → year-scope
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, Layers, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';

interface PresentationPreviewProps {
  downloadUrl?:  string;
  reportId?:     string;     // ← preferred: stable Sanity reportId
  period?:       string;     // ← e.g. "Q3 2024" or "Full Year 2025"
  scope?:        'quarter' | 'year';  // ← NEW: forwarded from message.presentationScope
  year?:         number;     // ← NEW: forwarded from message.year
  quarter?:      string;     // ← NEW: forwarded from message.quarter
  slideCount?:   number;
  className?:    string;
  // Kept for backwards compatibility, but no longer sent to the API:
  slidePlan?:    unknown;
  intelligence?: unknown;
}

type GenState = 'idle' | 'generating' | 'ready' | 'downloading' | 'error';

// Mirrors the 8-slide uxproof deck: white foundation, graphite headline
// slide, black trend/summary panels — violet/pink accents live inside
// the slides, not in the thumbnails.
const DECK_SLIDES = [
  { n: 1, label: 'Cover',           bg: 'bg-white border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800', txt: 'text-zinc-400' },
  { n: 2, label: 'Headline Score',  bg: 'bg-[#2E2E36]',                                                          txt: 'text-white/80' },
  { n: 3, label: 'Trend',           bg: 'bg-zinc-900',                                                           txt: 'text-white/70' },
  { n: 4, label: 'UX Indicators',   bg: 'bg-white border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800', txt: 'text-zinc-400' },
  { n: 5, label: 'Issues',          bg: 'bg-white border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800', txt: 'text-zinc-400' },
  { n: 6, label: 'Recommendations', bg: 'bg-white border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800', txt: 'text-zinc-400' },
  { n: 7, label: 'Summary',         bg: 'bg-zinc-900',                                                           txt: 'text-white/70' },
  { n: 8, label: 'Thank You',       bg: 'bg-white border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800', txt: 'text-zinc-400' },
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
}: PresentationPreviewProps) {
  const [genState, setGenState] = useState<GenState>(initialUrl ? 'ready' : 'idle');
  const [url,      setUrl]      = useState(initialUrl ?? '');
  const [error,    setError]    = useState('');
  const [count,    setCount]    = useState(slideCount ?? 8);

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
        setCount(data.slidesCount ?? 8);
      }
      setGenState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }

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
      {DECK_SLIDES.map(slide => (
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
            <p className="text-xs text-muted-foreground">{count} slides · PAISAK4U branded</p>
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
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
          >
            {genState === 'downloading'
              ? <Loader2 className="size-3.5 animate-spin" />
              : <Download className="size-3.5" />
            }
            {genState === 'downloading' ? 'Downloading…' : 'Download .pptx'}
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">PAISAK4U research template</span>
        </div>
      </motion.div>
    );
  }

  if (genState === 'generating') {
    return (
      <div className={`rounded-xl border border-border bg-card p-4 space-y-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm text-foreground">{period}</h4>
            <p className="text-xs text-muted-foreground">Building 8-slide research deck…</p>
          </div>
          <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
        </div>
        <SlideGrid />
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative rounded-full h-2 w-2 bg-violet-500" />
          </span>
          Applying PAISAK4U branding…
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
          <p className="text-xs text-muted-foreground">8 slides · PAISAK4U research template</p>
        </div>
      </div>

      <SlideGrid />

      <div className="border-t border-border pt-2">
        <Button
          size="sm"
          onClick={handleGenerate}
          className="w-full gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Download className="size-3.5" />
          Generate &amp; download .pptx
        </Button>
      </div>
    </motion.div>
  );
}