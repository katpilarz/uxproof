/**
 * lib/services/report-query.ts
 *
 * Fetches and aggregates UX research reports from Sanity, and parses
 * natural-language period intents.
 *
 * INTENT SCOPING NOTE: single-field queries are scoped precisely —
 * "what is the SUS score for Q4 2025" → single Q4 2025
 * "full year 2025" → year 2025
 * "2025" alone (no qualifier) → year 2025 (bare year is year scope)
 * A year alongside a Qn token is always a single-quarter query.
 */

import { createClient } from '@sanity/client';

const sanity = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset:   process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn:    false,
  apiVersion: '2024-01-01',
  token:     process.env.SANITY_API_TOKEN,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPI {
  _key: string;
  label: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

export interface Issue {
  _key: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

export interface Insight {
  _key: string;
  category: 'usability' | 'behavioral' | 'accessibility' | 'opportunity';
  title: string;
  summary: string;
}

export interface SanityReport {
  _id: string;
  reportId: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: number;
  client: string;
  product: string;
  platform: string;
  methods: string[];
  susScore: number;
  susChange: number;
  taskSuccessRate: number;
  npsScore: number;
  participants: number;
  errorRate: number;
  conversionRate: number;
  kpis: KPI[];
  issues: Issue[];
  insights: Insight[];
}

export type QueryMode =
  | 'single'
  | 'comparison'
  | 'year'
  | 'year-comparison'
  | 'half-year'
  | 'multi-quarter'
  | 'all';

export interface AggregatedMetrics {
  avgSusScore: number;
  avgSusChange: number;
  avgTaskSuccessRate: number;
  avgNpsScore: number;
  totalParticipants: number;
  avgErrorRate: number;
  avgConversionRate: number;
}

export interface ReportContext {
  mode: QueryMode;
  primary?: SanityReport;
  comparison?: SanityReport;
  delta?: ReportDelta;
  reports?: SanityReport[];
  aggregated?: AggregatedMetrics;
  comparisonReports?: SanityReport[];
  comparisonAggregated?: AggregatedMetrics;
  period: string;
  comparisonPeriod?: string;
}

export interface ReportDelta {
  susScore: number;
  susChange: number;
  taskSuccessRate: number;
  npsScore: number;
  participants: number;
  errorRate: number;
  conversionRate: number;
}

// ─── GROQ ─────────────────────────────────────────────────────────────────────

// coalesce(): user-uploaded reports may carry no kpis/issues/insights at
// all — GROQ projects missing arrays as null, and the response builders
// call .length on them, so always fall back to [].
const REPORT_FRAGMENT = `
  _id, reportId, quarter, year,
  client, product, platform, methods,
  susScore, susChange, taskSuccessRate, npsScore,
  participants, errorRate, conversionRate,
  "kpis":     coalesce(kpis[]  { _key, label, value, change, trend }, []),
  "issues":   coalesce(issues[] { _key, title, severity, description, recommendation }, []),
  "insights": coalesce(insights[] { _key, category, title, summary }, [])
`;

const QUARTER_ORDER = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
type Quarter = typeof QUARTER_ORDER[number];

// ─── Raw fetchers ─────────────────────────────────────────────────────────────

// All fetchers are USER-SCOPED: reports are created from a user's uploaded
// files and carry an owner reference, so every query filters on it. There
// is no global dataset any more.

export async function fetchReport(quarter: string, year: number, userId: string): Promise<SanityReport | null> {
  return sanity.fetch(
    `*[_type == "report" && quarter == $quarter && year == $year && user._ref == $userId][0] { ${REPORT_FRAGMENT} }`,
    { quarter, year, userId }
  );
}

export async function fetchReportsByYear(year: number, userId: string): Promise<SanityReport[]> {
  return sanity.fetch(
    `*[_type == "report" && year == $year && user._ref == $userId] | order(quarter asc) { ${REPORT_FRAGMENT} }`,
    { year, userId }
  );
}

export async function fetchReportsByQuarters(quarters: Quarter[], year: number, userId: string): Promise<SanityReport[]> {
  return sanity.fetch(
    `*[_type == "report" && year == $year && quarter in $quarters && user._ref == $userId] | order(quarter asc) { ${REPORT_FRAGMENT} }`,
    { year, quarters, userId }
  );
}

/**
 * The user's most recent report — the answer to "which period did they mean?"
 * when the query names none. Ordering is year first, then quarter, both
 * descending, so Q3 2026 beats Q1 2026 and 2026 beats 2025.
 */
export async function fetchLatestReport(userId: string): Promise<SanityReport | null> {
  return sanity.fetch(
    `*[_type == "report" && user._ref == $userId] | order(year desc, quarter desc)[0] { ${REPORT_FRAGMENT} }`,
    { userId }
  );
}

/** Everything the deck is allowed to draw on, straight from the report. */
export interface ReportFacts {
  issues:   number;
  insights: number;
  metrics:  string[];
  tasks:             Array<{ code: string; name?: string; successRate?: number; medianTime?: string; errors?: number }>;
  participantScores: Array<{ participant: string; score: number }>;
  quotes:            Array<{ text: string; attribution?: string }>;
}

/**
 * What a period's report actually recorded, for grounding the deck. The
 * slide plan is derived output and can carry findings the report never
 * had — asked about a period with an empty issues array, the planning
 * agent still emits issueItem blocks. These counts are the source of
 * truth the deck is clipped to.
 */
export async function fetchReportGrounding(
  userId:   string,
  year:     number,
  quarter?: string,
): Promise<ReportFacts> {
  const row = await sanity.fetch(
    `*[_type == "report" && user._ref == $userId && year == $year${
      quarter ? ' && quarter == $quarter' : ''
    }] | order(quarter desc)[0]{
      "issues":   coalesce(count(issues[]),   0),
      "insights": coalesce(count(insights[]), 0),
      susScore, susChange, taskSuccessRate, npsScore,
      participants, errorRate, conversionRate,
      tasks[]{ code, name, successRate, medianTime, errors },
      participantScores[]{ participant, score },
      quotes[]{ text, attribution }
    }`,
    quarter ? { userId, year, quarter } : { userId, year },
  );

  // A metric counts as recorded only when the report holds an actual
  // number for it — null means the study never measured it, and a deck
  // card reading "+0" for such a metric is an invention.
  const METRIC_FIELDS = [
    'susScore', 'susChange', 'taskSuccessRate', 'npsScore',
    'participants', 'errorRate', 'conversionRate',
  ] as const;
  const metrics = METRIC_FIELDS.filter(f => typeof row?.[f] === 'number');

  return {
    issues:   row?.issues ?? 0,
    insights: row?.insights ?? 0,
    metrics,
    tasks:             Array.isArray(row?.tasks) ? row.tasks : [],
    participantScores: Array.isArray(row?.participantScores) ? row.participantScores : [],
    quotes:            Array.isArray(row?.quotes) ? row.quotes : [],
  };
}

export async function fetchAllReports(userId: string): Promise<SanityReport[]> {
  return sanity.fetch(
    `*[_type == "report" && user._ref == $userId] | order(year asc, quarter asc) { ${REPORT_FRAGMENT} }`,
    { userId }
  );
}

/**
 * Just the periods this user has data for, newest first — enough to build
 * suggestions and "what data do I have?" answers without pulling every
 * metric of every report.
 */
export interface UserPeriod {
  quarter: Quarter;
  year:    number;
  /** Whether this period has qualitative content behind it. CSV uploads
   *  carry metrics only, so suggesting "what are the recommendations?" for
   *  one would lead straight to "there are none". */
  hasIssues:   boolean;
  hasInsights: boolean;
}

export async function fetchUserPeriods(userId: string): Promise<UserPeriod[]> {
  const rows: UserPeriod[] = await sanity.fetch(
    `*[_type == "report" && user._ref == $userId] | order(year desc, quarter desc) {
      quarter, year,
      "hasIssues":   coalesce(count(issues[])   > 0, false),
      "hasInsights": coalesce(count(insights[]) > 0, false)
    }`,
    { userId }
  );
  return rows ?? [];
}

/** How many reports this user has — the "do you have any data yet?" gate. */
export async function countUserReports(userId: string): Promise<number> {
  return sanity.fetch(
    `count(*[_type == "report" && user._ref == $userId])`,
    { userId }
  );
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateReports(reports: SanityReport[]): AggregatedMetrics {
  const n = reports.length;
  if (n === 0) return {
    avgSusScore: 0, avgSusChange: 0, avgTaskSuccessRate: 0,
    avgNpsScore: 0, totalParticipants: 0, avgErrorRate: 0, avgConversionRate: 0,
  };
  return {
    avgSusScore:        parseFloat((reports.reduce((s, r) => s + r.susScore, 0) / n).toFixed(1)),
    avgSusChange:       parseFloat((reports.reduce((s, r) => s + r.susChange, 0) / n).toFixed(1)),
    avgTaskSuccessRate: parseFloat((reports.reduce((s, r) => s + r.taskSuccessRate, 0) / n).toFixed(1)),
    avgNpsScore:        parseFloat((reports.reduce((s, r) => s + r.npsScore, 0) / n).toFixed(1)),
    totalParticipants:  reports.reduce((s, r) => s + r.participants, 0),
    avgErrorRate:       parseFloat((reports.reduce((s, r) => s + r.errorRate, 0) / n).toFixed(2)),
    avgConversionRate:  parseFloat((reports.reduce((s, r) => s + r.conversionRate, 0) / n).toFixed(2)),
  };
}

function deltaAggregated(a: AggregatedMetrics, b: AggregatedMetrics): ReportDelta {
  const pct = (x: number, y: number) => y === 0 ? 0 : parseFloat(((x - y) / Math.abs(y) * 100).toFixed(1));
  const pp  = (x: number, y: number) => parseFloat((x - y).toFixed(2));
  return {
    susScore:        pp(a.avgSusScore, b.avgSusScore),
    susChange:       pp(a.avgSusChange, b.avgSusChange),
    taskSuccessRate: pp(a.avgTaskSuccessRate, b.avgTaskSuccessRate),
    npsScore:        pp(a.avgNpsScore, b.avgNpsScore),
    participants:    pct(a.totalParticipants, b.totalParticipants),
    errorRate:       pp(a.avgErrorRate, b.avgErrorRate),
    conversionRate:  pp(a.avgConversionRate, b.avgConversionRate),
  };
}

function deltaSingle(p: SanityReport, c: SanityReport): ReportDelta {
  const pct = (a: number, b: number) => b === 0 ? 0 : parseFloat(((a - b) / Math.abs(b) * 100).toFixed(1));
  const pp  = (a: number, b: number) => parseFloat((a - b).toFixed(2));
  return {
    susScore:        pp(p.susScore, c.susScore),
    susChange:       pp(p.susChange, c.susChange),
    taskSuccessRate: pp(p.taskSuccessRate, c.taskSuccessRate),
    npsScore:        pp(p.npsScore, c.npsScore),
    participants:    pct(p.participants, c.participants),
    errorRate:       pp(p.errorRate, c.errorRate),
    conversionRate:  pp(p.conversionRate, c.conversionRate),
  };
}

// ─── Intent parsing helpers ───────────────────────────────────────────────────

interface ResolvedPeriod { quarter: Quarter; year: number; }

function currentQuarter(): ResolvedPeriod {
  const now = new Date();
  const idx = Math.floor(now.getMonth() / 3);
  return { quarter: QUARTER_ORDER[idx], year: now.getFullYear() };
}

function previousPeriod(p: ResolvedPeriod): ResolvedPeriod {
  const idx = QUARTER_ORDER.indexOf(p.quarter);
  return idx === 0
    ? { quarter: 'Q4', year: p.year - 1 }
    : { quarter: QUARTER_ORDER[idx - 1], year: p.year };
}

function resolveQuarter(text: string): ResolvedPeriod | null {
  const lower = text.toLowerCase().trim();
  const now   = new Date();
  const yr    = now.getFullYear();
  const idx   = Math.floor(now.getMonth() / 3);

  // "Q3 2025", "q3 2025"
  const explicit = lower.match(/\b(q[1-4])\s*(\d{4})\b/);
  if (explicit) return { quarter: explicit[1].toUpperCase() as Quarter, year: parseInt(explicit[2]) };

  // "Q3" alone
  const quarterOnly = lower.match(/\b(q[1-4])\b/);
  if (quarterOnly) return { quarter: quarterOnly[1].toUpperCase() as Quarter, year: yr };

  if (/last quarter|previous quarter/.test(lower)) {
    const prevIdx = idx === 0 ? 3 : idx - 1;
    return { quarter: QUARTER_ORDER[prevIdx], year: idx === 0 ? yr - 1 : yr };
  }
  if (/this quarter|current quarter/.test(lower)) return currentQuarter();

  const named: Record<string, Quarter> = {
    'first quarter':  'Q1', 'second quarter': 'Q2',
    'third quarter':  'Q3', 'fourth quarter': 'Q4',
  };
  for (const [phrase, q] of Object.entries(named)) {
    if (lower.includes(phrase)) return { quarter: q, year: yr };
  }
  return null;
}

// ─── parseIntent ──────────────────────────────────────────────────────────────
// Year-only queries require explicit scope keywords (full year / annual / fy)
// or a bare year; a year present alongside a Q-reference → single quarter.

type ParsedIntent =
  | { type: 'single'; period: ResolvedPeriod }
  | { type: 'quarter-comparison'; periodA: ResolvedPeriod; periodB: ResolvedPeriod }
  | { type: 'year'; year: number }
  | { type: 'year-comparison'; yearA: number; yearB: number }
  | { type: 'half'; half: 1 | 2; year: number }
  | { type: 'multi-quarter'; quarters: Quarter[]; year: number }
  | { type: 'all' }
  /** No period named anywhere in the query — resolve against the user's
   *  own data rather than guessing a date. */
  | { type: 'latest' };

function parseIntent(query: string): ParsedIntent {
  const lower = query.toLowerCase();

  // ── All ────────────────────────────────────────────────────────────────────
  if (/all quarters|full history|trend overview|all reports|every quarter/.test(lower)) {
    return { type: 'all' };
  }

  // ── Year comparison: "2024 vs 2025", "compare 2024 and 2025" ──────────────
  const yearComp = lower.match(/\b(20\d{2})\s+(?:vs\.?|versus|compared to|and)\s+(20\d{2})\b/);
  if (yearComp) {
    return { type: 'year-comparison', yearA: parseInt(yearComp[1]), yearB: parseInt(yearComp[2]) };
  }

  // ── Quarter comparison: "Q2 vs Q3 2024" ───────────────────────────────────
  const quarterComp = lower.match(
    /\b(q[1-4](?:\s*\d{4})?)\s+(?:vs\.?|versus|compared to|and)\s+(q[1-4](?:\s*\d{4})?)\b/
  );
  if (quarterComp) {
    const a = resolveQuarter(quarterComp[1]);
    const b = resolveQuarter(quarterComp[2]);
    if (a && b) {
      const yr = parseInt(lower.match(/\b(20\d{2})\b/)?.[1] ?? String(a.year));
      return {
        type: 'quarter-comparison',
        periodA: { ...a, year: parseInt(quarterComp[1].match(/\d{4}/)?.[0] ?? String(yr)) },
        periodB: { ...b, year: parseInt(quarterComp[2].match(/\d{4}/)?.[0] ?? String(yr)) },
      };
    }
  }

  // ── Half year: "H1 2025", "first half 2024" ───────────────────────────────
  const halfMatch = lower.match(/\b(h1|h2|first half|second half)\s*(20\d{2})\b/);
  if (halfMatch) {
    const half = (halfMatch[1] === 'h1' || halfMatch[1] === 'first half') ? 1 : 2;
    return { type: 'half', half, year: parseInt(halfMatch[2]) };
  }

  // ── Multi-quarter range: "Q2 through Q4 2024" ────────────────────────────
  const multiMatch = lower.match(/\b(q[1-4])\s+(?:through|to|thru|-)\s+(q[1-4])\s*(20\d{2})?\b/);
  if (multiMatch) {
    const startIdx = QUARTER_ORDER.indexOf(multiMatch[1].toUpperCase() as Quarter);
    const endIdx   = QUARTER_ORDER.indexOf(multiMatch[2].toUpperCase() as Quarter);
    const yr       = multiMatch[3] ? parseInt(multiMatch[3]) : new Date().getFullYear();
    const quarters = QUARTER_ORDER.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
    return { type: 'multi-quarter', quarters, year: yr };
  }

  // ── Full year ONLY when explicit year-scope keyword present ───────────────
  const hasQuarterRef = /\bq[1-4]\b/.test(lower);
  const yearMatch     = lower.match(/\b(20\d{2})\b/);

  if (yearMatch && !hasQuarterRef) {
    const yr = parseInt(yearMatch[1]);
    const hasYearScopeKeyword = /\b(full year|full-year|annual|fy|all of|overview|summary|performance|report|year in review|yearly|whole year|entire year)\b/.test(lower)
      || /^\s*(20\d{2})\s*$/.test(lower.trim()); // bare year alone

    if (hasYearScopeKeyword) {
      return { type: 'year', year: yr };
    }
    // Year present, no scope keyword, no quarter. Q4 was assumed here, which
    // silently answers about a quarter the user may not have uploaded;
    // 'year' covers whatever they do have for that year and the aggregation
    // degrades gracefully to a single quarter.
    return { type: 'year', year: yr };
  }

  // ── Last year / this year ─────────────────────────────────────────────────
  const nowYear = new Date().getFullYear();
  if (/last year|previous year/.test(lower)) return { type: 'year', year: nowYear - 1 };
  if (/this year|current year/.test(lower))  return { type: 'year', year: nowYear };

  // ── Single quarter (default fallback) ────────────────────────────────────
  const single = resolveQuarter(query);
  if (single) return { type: 'single', period: single };

  // ── Default: no period named ─────────────────────────────────────────────
  // This used to return a hardcoded { Q1, 2026 } — the "most recent seeded
  // quarter" from the demo-dataset era. Since every report is now created
  // from a user's own upload, that constant was simply wrong for everyone:
  // "generate a presentation" resolved to a period the user had never
  // uploaded, and the honest no-data refusal downstream named a quarter
  // that had appeared from nowhere. Defer to the user's actual data instead.
  return { type: 'latest' };
}

// ─── Main resolver ────────────────────────────────────────────────────────────

export async function resolveReportContext(query: string, userId: string): Promise<ReportContext | null> {
  const intent = parseIntent(query);

  switch (intent.type) {

    case 'single': {
      const primary = await fetchReport(intent.period.quarter, intent.period.year, userId);
      if (!primary) return null;
      const prev       = previousPeriod(intent.period);
      const comparison = await fetchReport(prev.quarter, prev.year, userId);
      return {
        mode: 'single',
        primary,
        comparison:       comparison ?? undefined,
        delta:            comparison ? deltaSingle(primary, comparison) : undefined,
        period:           `${primary.quarter} ${primary.year}`,
        comparisonPeriod: comparison ? `${comparison.quarter} ${comparison.year}` : undefined,
      };
    }

    case 'quarter-comparison': {
      const [a, b] = await Promise.all([
        fetchReport(intent.periodA.quarter, intent.periodA.year, userId),
        fetchReport(intent.periodB.quarter, intent.periodB.year, userId),
      ]);
      if (!a || !b) return null;
      const aIdx = QUARTER_ORDER.indexOf(a.quarter);
      const bIdx = QUARTER_ORDER.indexOf(b.quarter);
      const [primary, comparison] =
        a.year > b.year || (a.year === b.year && aIdx > bIdx) ? [a, b] : [b, a];
      return {
        mode: 'comparison',
        primary, comparison,
        delta:            deltaSingle(primary, comparison),
        period:           `${primary.quarter} ${primary.year}`,
        comparisonPeriod: `${comparison.quarter} ${comparison.year}`,
      };
    }

    case 'year': {
      const reports = await fetchReportsByYear(intent.year, userId);
      if (!reports.length) return null;
      return {
        mode:       'year',
        reports,
        aggregated: aggregateReports(reports),
        period:     `Full Year ${intent.year}`,
      };
    }

    case 'year-comparison': {
      const [reportsA, reportsB] = await Promise.all([
        fetchReportsByYear(intent.yearA, userId),
        fetchReportsByYear(intent.yearB, userId),
      ]);
      if (!reportsA.length || !reportsB.length) return null;
      const aggA = aggregateReports(reportsA);
      const aggB = aggregateReports(reportsB);
      const [primary, comparison, primaryReports, compReports, primaryYear, compYear] =
        intent.yearA > intent.yearB
          ? [aggA, aggB, reportsA, reportsB, intent.yearA, intent.yearB]
          : [aggB, aggA, reportsB, reportsA, intent.yearB, intent.yearA];
      return {
        mode:                  'year-comparison',
        reports:               primaryReports,
        aggregated:            primary,
        comparisonReports:     compReports,
        comparisonAggregated:  comparison,
        delta:                 deltaAggregated(primary, comparison),
        period:                `Full Year ${primaryYear}`,
        comparisonPeriod:      `Full Year ${compYear}`,
      };
    }

    case 'half': {
      const quarters: Quarter[] = intent.half === 1 ? ['Q1', 'Q2'] : ['Q3', 'Q4'];
      const reports  = await fetchReportsByQuarters(quarters, intent.year, userId);
      if (!reports.length) return null;
      const prevReports = await fetchReportsByQuarters(quarters, intent.year - 1, userId);
      return {
        mode:                  'half-year',
        reports,
        aggregated:            aggregateReports(reports),
        comparisonReports:     prevReports.length ? prevReports : undefined,
        comparisonAggregated:  prevReports.length ? aggregateReports(prevReports) : undefined,
        delta:                 prevReports.length
          ? deltaAggregated(aggregateReports(reports), aggregateReports(prevReports))
          : undefined,
        period:                `H${intent.half} ${intent.year}`,
        comparisonPeriod:      prevReports.length ? `H${intent.half} ${intent.year - 1}` : undefined,
      };
    }

    case 'multi-quarter': {
      const reports = await fetchReportsByQuarters(intent.quarters, intent.year, userId);
      if (!reports.length) return null;
      return {
        mode:       'multi-quarter',
        reports,
        aggregated: aggregateReports(reports),
        period:     `${intent.quarters[0]}–${intent.quarters[intent.quarters.length - 1]} ${intent.year}`,
      };
    }

    case 'all': {
      const reports = await fetchAllReports(userId);
      if (!reports.length) return null;
      return {
        mode:       'all',
        reports,
        aggregated: aggregateReports(reports),
        period:     'All Available Periods',
      };
    }

    case 'latest': {
      // The query named no period, so "the latest thing you uploaded" is the
      // only defensible reading. Returning null here (no reports at all) is
      // what puts the caller on the "upload something first" path.
      const primary = await fetchLatestReport(userId);
      if (!primary) return null;
      const prev       = previousPeriod({ quarter: primary.quarter as Quarter, year: primary.year });
      const comparison = await fetchReport(prev.quarter, prev.year, userId);
      return {
        mode: 'single',
        primary,
        comparison:       comparison ?? undefined,
        delta:            comparison ? deltaSingle(primary, comparison) : undefined,
        period:           `${primary.quarter} ${primary.year}`,
        comparisonPeriod: comparison ? `${comparison.quarter} ${comparison.year}` : undefined,
      };
    }
  }
}
