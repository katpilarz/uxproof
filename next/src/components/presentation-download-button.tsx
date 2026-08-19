'use client';

/**
 * components/presentation-download-button.tsx — v2
 *
 * CHANGES OVER v1:
 *   New optional props: `scope`, `year`, `quarter`. When the parent message
 *   carries `presentationScope === 'year'` from unified-agent, the button now
 *   POSTs `{ scope: 'year', year }` to /api/presentations instead of trying
 *   to parse a Q-token out of "Full Year 2025" (which fails silently and
 *   produces the empty default deck).
 *
 *   The body the route receives depends on what the parent supplied:
 *     - reportId present                   → { reportId, period }
 *     - scope='year' + year                → { scope:'year', year, period }
 *     - quarter + year                     → { scope:'quarter', quarter, year, period }
 *     - only `period` (e.g. "Q3 2024")    → quarter+year parsed from period
 *     - only `period` (e.g. "Full Year 2025") → scope='year' + year parsed from period
 *
 *   The route's resolution order (see app/api/presentations/route.ts v3):
 *     slidePlanId  →  scope:'year' + year  →  reportId  →  quarter+year
 *
 *   so explicit scope='year' takes priority over any quarter we might
 *   accidentally include.
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface PresentationDownloadButtonProps {
  downloadUrl?:  string;       // pre-generated URL
  reportId?:     string;       // ← preferred: stable Sanity reportId
  period?:       string;       // ← e.g. "Q3 2024" or "Full Year 2025"
  scope?:        'quarter' | 'year';  // ← NEW: forwarded from message.presentationScope
  year?:         number;       // ← NEW: forwarded from message.year
  quarter?:      string;       // ← NEW: forwarded from message.quarter
  slideCount?:   number;
  className?:    string;
  // Kept for backwards compatibility, but no longer sent to the API:
  slidePlan?:    unknown;
  intelligence?: unknown;
}

type GenerateState = 'idle' | 'generating' | 'ready' | 'error';

/** Parse "Q3 2024" → { quarter: "Q3", year: 2024 }. Returns null if unparseable. */
function parseQuarterPeriod(period: string): { quarter: string; year: number } | null {
  const m = period.match(/(Q[1-4])\s+(\d{4})/i);
  if (!m) return null;
  return { quarter: m[1].toUpperCase(), year: parseInt(m[2], 10) };
}

/** Parse "Full Year 2025" or bare "2025" → { year: 2025 }. Returns null if no year. */
function parseYearPeriod(period: string): { year: number } | null {
  const m = period.match(/\b(20\d{2})\b/);
  if (!m) return null;
  return { year: parseInt(m[1], 10) };
}

/** Heuristic: does this period string describe a year scope rather than a quarter? */
function isYearScopePeriod(period: string): boolean {
  if (/Q[1-4]/i.test(period)) return false;
  if (/full year/i.test(period)) return true;
  if (/\b20\d{2}\b/.test(period)) return true;
  return false;
}

export function PresentationDownloadButton({
  downloadUrl,
  reportId,
  period = 'Executive Report',
  scope,
  year,
  quarter,
  slideCount,
  className = '',
}: PresentationDownloadButtonProps) {
  const [genState, setGenState] = useState<GenerateState>(
    downloadUrl ? 'ready' : 'idle',
  );
  const [url, setUrl]     = useState(downloadUrl ?? '');
  const [error, setError] = useState('');
  const [count, setCount] = useState(slideCount ?? 0);

  /**
   * Build the body for POST /api/presentations.
   * Priority of explicit props over parsed-from-period:
   *   1. reportId (most specific — short-circuits everything else)
   *   2. explicit scope/year/quarter from the parent message
   *   3. parsed from period string (fallback for legacy callers)
   */
  function buildRequestBody() {
    const body: Record<string, unknown> = {
      title:  period,
      period,
    };

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
      // For year scope, DO NOT send a quarter — route v3's branch order
      // checks scope+year before quarter+year.
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
      console.log('[presentation-download] POST /api/presentations', requestBody);

      const res = await fetch('/api/presentations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const ct   = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : {};
        throw new Error(data.error ?? `Generation failed: ${res.status}`);
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
      }
      setGenState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenState('error');
    }
  }

  // ── Ready — show download link ──────────────────────────────────────────
  if (genState === 'ready' && url) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`inline-flex items-center gap-3 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-4 py-2.5 ${className}`}
      >
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald-400 tracking-wide">
            Presentation ready
          </span>
          {count > 0 && (
            <span className="text-[11px] text-zinc-500">{count} slides · research template</span>
          )}
        </div>

        <a
          href={url}
          download={`${period.replace(/\s+/g, '_')}_UX_Report.pptx`}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors px-3 py-1.5 text-xs font-semibold text-white shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download .pptx
        </a>
      </motion.div>
    );
  }

  // ── Generating ──────────────────────────────────────────────────────────
  if (genState === 'generating') {
    return (
      <div className={`inline-flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 ${className}`}>
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
        </span>
        <span className="text-xs text-zinc-400">Generating presentation…</span>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (genState === 'error') {
    return (
      <div className={`inline-flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-2.5 ${className}`}>
        <span className="text-xs text-red-400">{error}</span>
        <button
          onClick={handleGenerate}
          className="text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Idle — trigger button ───────────────────────────────────────────────
  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleGenerate}
      className={`inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 transition-colors px-4 py-2.5 text-xs font-medium text-zinc-200 ${className}`}
    >
      <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Generate .pptx presentation
    </motion.button>
  );
}