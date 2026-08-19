/**
 * app/api/presentations/route.ts — v3
 *
 * CHANGES OVER v2:
 *   v2 added the year-scope branch and getSlidePlanForYear().
 *   v3 closes the loop: when a year-scope request arrives but no
 *   slideplan_year_<year> exists in Sanity yet, the route now TRIGGERS
 *   the FastAPI orchestrator to build one, waits for persistence, and
 *   then re-fetches. This is what makes "Generate 2025 presentation"
 *   actually produce a year-aggregated deck on first call instead of
 *   silently falling back to the latest quarter's plan.
 *
 *   The same trigger logic also applies to quarter-scope requests
 *   where no slidePlan exists for that period yet — the route used to
 *   render the empty default deck; now it builds one on demand.
 *
 *   Trigger is gated by env var ORCHESTRATOR_URL — if unset, route
 *   falls back to v2 behaviour (use whatever's in Sanity, default if
 *   nothing). Set ORCHESTRATOR_URL=http://localhost:8000 (or wherever
 *   FastAPI is running) to enable on-demand generation.
 *
 *   ENV
 *     ORCHESTRATOR_URL    — base URL of the FastAPI pipeline service
 *     ORCHESTRATOR_TIMEOUT_MS — defaults to 120_000 (2 min)
 *
 * REQUEST BODY (any of):
 *   { reportId: "report-ux-q3-2024" }
 *   { quarter: "Q3", year: 2024 }
 *   { slidePlanId: "slideplan_report-ux-q3-2024" }
 *   { year: 2025, scope: "year" }
 *   { period: "Q3 2024" }                       // legacy, used for label only
 *   { slide_plan: {...}, intelligence: {...} }  // legacy direct-pass
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

import {
  generatePowerPoint,
  loadSlidesFromPlan,
  buildDefaultSlides,
  SlideConfig,
} from '@/lib/ppt-generator';
import {
  getSlidePlan,
  getSlidePlanById,
  getSlidePlanForPeriod,
  getSlidePlanForYear,
  logSlidePlanShape,
  savePresentation,
  getPresentationsForUser,
} from '@/lib/sanity';
import { getCurrentUser } from '@/lib/auth';
import { downloadsDir } from '@/lib/downloads';

// ─── Orchestration trigger ────────────────────────────────────────────────────

const ORCHESTRATOR_URL        = process.env.ORCHESTRATOR_URL || '';
const ORCHESTRATOR_TIMEOUT_MS = parseInt(process.env.ORCHESTRATOR_TIMEOUT_MS || '120000', 10);

interface OrchestratorTriggerArgs {
  mode:     'year' | 'single';
  year?:    number;
  quarter?: string;
  userId?:  string;   // scopes the pipeline's report fetches + year-plan id
}

/**
 * Tell the FastAPI orchestrator to run the Context → Extraction → Planning
 * pipeline for the given period. Returns true if the orchestrator reports
 * success; false on timeout, network error, or non-200 response.
 *
 * This is best-effort: callers should re-check Sanity for the persisted
 * slidePlan regardless of the return value, because the orchestrator may
 * have written the doc before the HTTP response arrived back.
 */
async function triggerOrchestrator(args: OrchestratorTriggerArgs): Promise<boolean> {
  if (!ORCHESTRATOR_URL) {
    console.warn('[presentations] ORCHESTRATOR_URL not set; skipping on-demand build');
    return false;
  }
  const url = `${ORCHESTRATOR_URL.replace(/\/$/, '')}/pipeline/run`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        mode:    args.mode,
        year:    args.year,
        quarter: args.quarter,
        user_id: args.userId,
        // Always ask for the planning agent to run; the orchestrator
        // skips it by default for "just analyse" calls.
        agents_requested: ['planning'],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[presentations] orchestrator non-200:', res.status, await res.text().catch(() => ''));
      return false;
    }
    // A 200 can still carry a failed pipeline — check the body's status.
    const data = await res.json().catch(() => null);
    if (data && data.status !== 'completed') {
      console.warn('[presentations] orchestrator pipeline failed:', data.status, data.error ?? '');
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[presentations] orchestrator call failed:', msg);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureDownloadsDir() {
  try { await fs.mkdir(downloadsDir(), { recursive: true }); } catch {}
}

// ─── GET — the signed-in user's generated presentations ──────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ presentations: [], error: 'Not signed in' }, { status: 401 });
  }
  try {
    const rows = await getPresentationsForUser(user.id);
    return NextResponse.json({ presentations: rows || [] });
  } catch (e) {
    console.error('[presentations] GET error:', e);
    return NextResponse.json({ presentations: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await ensureDownloadsDir();

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const {
      reportId,
      quarter,
      year,
      slidePlanId,
      scope,
      period,
      title,
      slide_plan: legacySlidePlan,
    } = body as {
      reportId?:    string;
      quarter?:     string;
      year?:        number;
      slidePlanId?: string;
      scope?:       'quarter' | 'year';
      period?:      string;
      title?:       string;
      slide_plan?:  any;
    };

    console.log('[presentations] lookup keys:', {
      reportId, quarter, year, slidePlanId, scope,
    });

    // ── 1. Fetch the slidePlan from Sanity — scoped to the signed-in
    //       user, so a stale/foreign report for the same period can never
    //       supply the deck's data.
    let plan: any = null;
    if (slidePlanId) {
      plan = await getSlidePlanById(slidePlanId, user.id);
    } else if (scope === 'year' && year) {
      plan = await getSlidePlanForYear(year, user.id);
    } else if (reportId) {
      plan = await getSlidePlan(reportId);
    } else if (quarter && year) {
      plan = await getSlidePlanForPeriod(quarter, year, user.id);
    } else if (legacySlidePlan) {
      plan = legacySlidePlan;
    }

    // ── 2. ON-DEMAND BUILD — trigger orchestrator if plan is missing ─────
    //
    // Without this step, "Generate 2025 presentation" would fall back to
    // the latest quarter's plan via getSlidePlanForYear's safety net,
    // producing a quarter-scoped deck labelled "Full Year 2025". That's
    // worse than refusing — it lies about the content.
    //
    // The trigger is fire-and-wait: we POST to the orchestrator and
    // block for up to ORCHESTRATOR_TIMEOUT_MS, then re-fetch from Sanity.
    // If the orchestrator is unreachable (ORCHESTRATOR_URL unset, network
    // error, timeout), we fall through to whatever was originally fetched
    // — which is also fine for staging environments.
    //
    // For year-scope: we ONLY trigger if no *_year_<year>* plan exists.
    // The latest-quarter fallback from getSlidePlanForYear is silently
    // discarded so we don't ship a misleading "year" deck.
    const expectedYearPlanId = `slideplan_year_${year}_${user.id.replace(/^user_/, '')}`;
    const needsYearPlan      = scope === 'year' && year && (!plan || plan._id !== expectedYearPlanId);
    const needsQuarterPlan   = !!(quarter && year && !plan);

    if (needsYearPlan) {
      console.log(`[presentations] no year-scope plan for ${year}; triggering orchestrator`);
      const ok = await triggerOrchestrator({ mode: 'year', year, userId: user.id });
      if (ok) {
        // Re-fetch — orchestrator should have persisted the user-scoped
        // slideplan_year_<year>_<userSuffix>
        plan = await getSlidePlanForYear(year, user.id);
        console.log('[presentations] post-orchestrator plan _id:', plan?._id);
      } else if (!plan) {
        // Orchestrator failed AND there was no fallback — render defaults
        // so the user gets feedback rather than a 500.
        console.warn('[presentations] orchestrator failed and no fallback plan; rendering defaults');
      }
    } else if (needsQuarterPlan) {
      console.log(`[presentations] no plan for ${quarter} ${year}; triggering orchestrator`);
      const ok = await triggerOrchestrator({ mode: 'single', quarter, year, userId: user.id });
      if (ok) {
        plan = await getSlidePlanForPeriod(quarter!, year!, user.id);
      }
    }

    logSlidePlanShape(plan);

    // ── 3. Sanity slidePlan → SlideConfig[] ───────────────────────────────
    let slides: SlideConfig[] = plan
      ? loadSlidesFromPlan(plan)
      : buildDefaultSlides();

    // Enforce 8 slides, numbered 1..8
    const defaults = buildDefaultSlides();
    while (slides.length < 8) {
      const fill = defaults[slides.length] ?? defaults[defaults.length - 1];
      slides.push({ ...fill, number: slides.length + 1 });
    }
    slides = slides.slice(0, 8).map((s, i) => ({ ...s, number: i + 1 }));

    // ── 4. Build the deck ─────────────────────────────────────────────────
    // Strip "Full Year " prefix from any source so the PPT footer
    // and Sanity presentation record both read "2025" not "Full Year 2025".
    const stripYearPrefix = (s: string) => s.replace(/^(Full Year|FY)\s+/i, '');

    const reportLabel = stripYearPrefix(
      plan?.period ||
      period ||
      (scope === 'year' && year ? `${year}` : '') ||
      (quarter && year ? `${quarter} ${year}` : '') ||
      'UX Research Report'
    );

    console.log('[presentations] rendering', slides.length, 'slides, label:', reportLabel);

    const result = await Promise.race([
      generatePowerPoint(slides, reportLabel),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('pptx generation timed out after 60s')), 60_000)
      ),
    ]);

    console.log('[presentations] done:', result.downloadUrl);

    // ── 5. Best-effort save to Sanity (non-fatal) ─────────────────────────
    savePresentation({
      _type:         'presentation',
      title:         title || reportLabel,
      quarter:       quarter || reportLabel,
      slidesCount:   slides.length,
      status:        'completed',
      downloadUrl:   result.downloadUrl,
      generatedDate: new Date().toISOString(),
    }, user.id).catch(err => console.warn('[presentations] Sanity save failed (non-fatal):', err));

    // ── 6. Serve binary directly on Vercel ────────────────────────────────
    const isVercel = process.env.VERCEL === '1';
    if (isVercel) {
      try {
        // downloadUrl is /api/presentations/file/<name>; the file itself
        // lives in downloadsDir() (outside public/ — see lib/downloads.ts).
        const fileName = result.downloadUrl.split('/').pop() || 'uxproof_report.pptx';
        const buffer   = await fs.readFile(path.join(downloadsDir(), fileName));
        return new Response(buffer, {
          headers: {
            'Content-Type':        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control':       'no-store',
          },
        });
      } catch (vercelErr) {
        console.error('[presentations] Vercel file read failed:', vercelErr);
      }
    }

    return NextResponse.json({
      ...result,
      slidesCount:   slides.length,
      generatedDate: result.generatedDate.toISOString(),
    });

  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[presentations] ERROR:', details);
    return NextResponse.json(
      { error: 'Failed to generate presentation', details },
      { status: 500 },
    );
  }
}