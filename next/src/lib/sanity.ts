// lib/sanity.ts — v2
//
// CHANGES OVER v1:
//   • Added getSlidePlanForYear(year) so the /api/presentations route
//     can resolve year-scope presentation requests. The planning agent
//     v7 persists year-scope plans under _id="slideplan_year_<year>";
//     this helper fetches them, falling back to the latest quarter's
//     plan within that year if no explicit year-scope plan exists.
//
// Everything else is unchanged from v1 — including the critical GROQ
// `content[]{ ... }` spread that keeps the typed block fields on the
// slide content array.

import { createClient, type SanityClient } from '@sanity/client';
import { createImageUrlBuilder, type SanityImageSource } from '@sanity/image-url';

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
export const dataset   = process.env.NEXT_PUBLIC_SANITY_DATASET    || 'production';

let client: SanityClient | undefined;

if (!client) {
  client = createClient({
    projectId,
    dataset,
    useCdn:     false,
    apiVersion: '2024-01-01',
    token:      process.env.SANITY_API_TOKEN || '',
  });
}

const imageUrlBuilder = createImageUrlBuilder(client);

export const urlFor = (source: SanityImageSource) => imageUrlBuilder.image(source);

// ── Existing report helpers (unchanged) ──────────────────────────────────────

export async function getReports(quarter: string, year?: number) {
  return client?.fetch(`
    *[_type == "report" && quarter == "${quarter}"${year ? `&& year == ${year}` : ''}]
    | order(generatedDate desc) {
      _id, title, quarter, year, client, product, platform,
      susScore, susChange, taskSuccessRate, npsScore,
      participants, errorRate, conversionRate
    }
  `);
}

export async function getProjectData(projectIdParam: string) {
  return client?.fetch(`
    *[_type == "project" && _id == "${projectIdParam}"] [0] {
      name, quarter, year, status, kpis[], risks[], insights[]
    }
  `);
}

export async function savePresentation(data: any) {
  return writeClient.createOrReplace({
    _type: 'presentation',
    _id:   `presentation_${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString(),
  });
}

export async function storeProcessedIntelligence(intelligence: any) {
  return client?.create({
    _type: 'executed_intelligence',
    ...intelligence,
    processedAt: new Date().toISOString(),
  });
}

export async function getHistoricalData(quarter: string) {
  const comparisonQuarter =
    quarter === 'Q3' ? 'Q2' :
    quarter === 'Q2' ? 'Q1' :
    quarter === 'Q1' ? 'Q4' : 'Q3';

  return client?.fetch(`
    *[_type == "report" && (quarter == "${comparisonQuarter}" || quarter == "${quarter}")]
    | order(year desc) { _id, quarter, year, susScore, susChange }
  `);
}

export async function seedDemoData() {
  console.log('Seed demo data from Sanity Studio');
}

// ── Write client (useCdn: false required for mutations) ──────────────────────

export const writeClient = createClient({
  projectId,
  dataset,
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

// ── Chat session helpers (unchanged) ─────────────────────────────────────────

export async function createChatSession(
  sessionId: string,
  context: { quarter: string },
) {
  return writeClient.createOrReplace({
    _type:     'chatSession',
    _id:       `chatSession_${sessionId}`,
    sessionId,
    quarter:   context.quarter,
    messages:  [],
    createdAt: new Date().toISOString(),
  });
}

export async function appendMessageToSession(
  sessionId: string,
  message: { messageId: string; role: 'user' | 'assistant'; content: string },
) {
  const docId = `chatSession_${sessionId}`;

  await writeClient.createIfNotExists({
    _type:     'chatSession',
    _id:       docId,
    sessionId,
    quarter:   'unknown',
    messages:  [],
    createdAt: new Date().toISOString(),
  });

  return writeClient
    .patch(docId)
    .setIfMissing({ messages: [] })
    .append('messages', [{
      _key:      message.messageId,
      messageId: message.messageId,
      role:      message.role,
      content:   message.content,
      timestamp: new Date().toISOString(),
    }])
    .commit();
}

// ── Report fetchers (unchanged) ──────────────────────────────────────────────

export async function getLatestReport(quarter: string, year: number) {
  return client?.fetch(
    `*[_type == "report" && quarter == $quarter && year == $year][0]`,
    { quarter, year },
  );
}

export async function getAllReports() {
  return client?.fetch(
    `*[_type == "report"] | order(year desc, quarter desc) {
      _id, reportId, quarter, year, client, product, platform,
      susScore, susChange, taskSuccessRate, npsScore,
      participants, errorRate, conversionRate
    }`,
  );
}

export async function getReportsByYear(year: number) {
  return client?.fetch(
    `*[_type == "report" && year == $year] | order(quarter asc)`,
    { year },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE PLAN FETCH
// ═══════════════════════════════════════════════════════════════════════════════
//
// The slidePlan document stored by the planning agent contains:
//   slides[]{
//     slideNumber, slideType, title, subtitle, speakerNotes,
//     content[] of typed blocks — each one is a different object type:
//       - subtitleBlock { text }
//       - kpiItem       { label, value, change, trend }
//       - chartBlock    { chartData[] { name, labels[], values[] } }
//       - issueItem     { title, description, severity }
//       - priorityItem  { title, description }
//   }
//
// GROQ NUANCE: when an array contains members of multiple object types,
// you MUST use a `...` spread inside the projection to keep every field
// on every member. A narrow `{ title, description }` projection only
// keeps fields that exist on EVERY member type — so on a kpiItem (which
// has no title) the projection returns null and the block becomes
// useless. The double-nested chartData also needs its own spread.
//
// All three slidePlan helpers below share the same projection. If you
// edit one, edit all three.

const SLIDE_PLAN_PROJECTION = `{
  _id, reportId, period, presentationTitle, totalSlides, narrativeArc, generatedAt,
  slides[]{
    _key,
    slideNumber,
    slideType,
    title,
    subtitle,
    speakerNotes,
    content[]{
      ...,
      chartData[]{ ... }
    },
    bullets[]{ _key, text }
  }
}`;

export async function getSlidePlan(reportId: string) {
  return client?.fetch(
    `*[_type == "slidePlan" && reportId == $reportId][0]${SLIDE_PLAN_PROJECTION}`,
    { reportId },
  );
}

// Convenience: resolve quarter+year → reportId → slidePlan in one call.
export async function getSlidePlanForPeriod(quarter: string, year: number) {
  const report: any = await client?.fetch(
    `*[_type == "report" && quarter == $quarter && year == $year][0]{ reportId, _id }`,
    { quarter, year },
  );
  if (!report) return null;
  return getSlidePlan(report.reportId || report._id);
}

// Convenience: resolve _id directly. Some deployments key slidePlans
// by a stable _id like `slideplan_<reportId>`.
export async function getSlidePlanById(slidePlanId: string) {
  return client?.fetch(
    `*[_type == "slidePlan" && _id == $id][0]${SLIDE_PLAN_PROJECTION}`,
    { id: slidePlanId },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// YEAR-SCOPE SLIDE PLAN FETCH
// ═══════════════════════════════════════════════════════════════════════════════
//
// Resolves a year-scope ("Full Year 2025") presentation request to the
// right slidePlan. The planning agent v7 persists year-scope plans with
// _id="slideplan_year_<year>" — this helper looks that up first.
//
// If no year-scope plan has been generated yet (e.g. the user runs the
// "Generate 2025 presentation" flow before the year pipeline has ever
// completed), we fall back to the most recent quarter's plan within
// that year so the route returns something useful rather than the
// empty default deck.
//
// Returns null only if neither a year plan nor any quarter plan exists
// for the given year.

export async function getSlidePlanForYear(year: number) {
  // 1. Try the explicit year-scope plan first.
  const yearPlan: any = await client?.fetch(
    `*[_type == "slidePlan" && _id == $id][0]${SLIDE_PLAN_PROJECTION}`,
    { id: `slideplan_year_${year}` },
  );
  if (yearPlan) {
    console.log('[slidePlan] year-scope plan found:', yearPlan._id);
    return yearPlan;
  }

  // 2. Fallback — most recent quarter's plan within that year.
  const latestReport: any = await client?.fetch(
    `*[_type == "report" && year == $year]
       | order(quarter desc)[0]{ reportId, _id }`,
    { year },
  );
  if (!latestReport) {
    console.warn(`[slidePlan] no reports found for year ${year}`);
    return null;
  }

  const fallback = await getSlidePlan(latestReport.reportId || latestReport._id);
  if (fallback) {
    console.log(
      `[slidePlan] year-scope plan missing for ${year}; ` +
      `falling back to latest quarter's plan (reportId=${latestReport.reportId || latestReport._id})`
    );
  }
  return fallback;
}

// ── Diagnostic helper ────────────────────────────────────────────────────────
// Logs what was fetched so you can confirm content[] is non-empty before
// the generator runs. Returns the slidePlan unchanged.

export function logSlidePlanShape(plan: any): any {
  if (!plan?.slides?.length) {
    console.warn('[slidePlan] empty or missing — generator will render defaults');
    return plan;
  }
  const summary = plan.slides.map((s: any) => ({
    n: s.slideNumber,
    type: s.slideType,
    contentBlocks: (s.content || []).length,
    blockTypes: (s.content || []).map((c: any) => c?._type).filter(Boolean),
  }));
  console.log('[slidePlan] slides:', JSON.stringify(summary, null, 2));
  return plan;
}