/**
 * lib/agents/unified-agent.ts
 *
 * Routes natural-language questions about the UX research data to the
 * right response shape:
 *
 *  1. PRECISE-METRIC QUESTIONS
 *     "What is the SUS score for Q2 2025?" returns a SHORT precise
 *     answer (one or two lines) instead of the full research report.
 *     detectMetricIntent() spots the metric name in the query and
 *     buildPreciseMetric() builds the focused response.
 *
 *  2. MISSING-PERIOD CLARIFICATION
 *     "Give me the usability issues" with no period reference ASKS
 *     which period instead of guessing a default.
 *
 *  3. YEAR vs QUARTER PRESENTATION ROUTING
 *     "Generate 2025 presentation" produces a full-year aggregated
 *     presentation across Q1-Q4 2025 — NOT the most recent quarter.
 *     "Generate Q2 2025 presentation" stays single-quarter.
 *
 *  4. PRESENTATION RESPONSE = SHORT SUMMARY + PREVIEW
 *     The chat reply for a generation request is a 3-4 line contextual
 *     summary + the preview/download CTA, not the full analytical dump.
 *
 *  5. NO PHANTOM CONTEXT REFS ON CASUAL MESSAGES
 *     Casual / meta replies return `contextRef: undefined` so the UI
 *     footer stays clean when the user just says "how are you".
 *
 * User-facing period labels strip the "Full Year " prefix via
 * displayPeriod(); the raw ctx.period is preserved internally so
 * year-mode detection keeps working.
 */

import {
  resolveReportContext,
  ReportContext,
  SanityReport,
  AggregatedMetrics,
} from '@/lib/services/report-query';
import { AIContext, AIResponse } from '@/types';

// ─── Sanity env var guard ─────────────────────────────────────────────────────

const SANITY_PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
const SANITY_TOKEN      = process.env.SANITY_API_TOKEN               || '';

function checkSanityConfig(): string | null {
  if (!SANITY_PROJECT_ID) return 'NEXT_PUBLIC_SANITY_PROJECT_ID is not set in .env.local';
  if (!SANITY_TOKEN)      return 'SANITY_API_TOKEN is not set in .env.local';
  return null;
}

// ─── Casual / meta detection ──────────────────────────────────────────────────

function isCasualOrMeta(query: string): boolean {
  const hasDataRef = /\b(q[1-4]|quarter|sus|nps|task success|error rate|conversion|participant|usability|kpi|metric|issue|insight|finding|presentation|powerpoint|pptx|year|annual|2[0-9]{3}|compare|analysis|research|report|analyse|analyze|overview|summary|deep|recommend|accessib)\b/i.test(query);
  if (hasDataRef) return false;

  const q = query.toLowerCase().trim();
  return (
    /^(hi|hello|hey|howdy|yo)\b/.test(q) ||
    /^how are you/.test(q) ||
    /^what('s| is) up/.test(q) ||
    /^good (morning|afternoon|evening)/.test(q) ||
    /^(thanks|thank you)\b/.test(q) ||
    /how (can|do) you help/.test(q) ||
    /what can you do/.test(q) ||
    /who are you/.test(q) ||
    /^help\b/.test(q) ||
    /^(ok|okay|cool|great|got it)\b/.test(q) ||
    /^(bye|goodbye)\b/.test(q) ||
    // "can you generate presentation for one timeframe only or few years?"
    // — capability question, not a data request
    /^(can you|are you able to|do you)\b.*\?$/.test(q) && !/\bq[1-4]\b|\b20\d{2}\b/.test(q)
  );
}

function buildCasualResponse(query: string): string {
  const q = query.toLowerCase().trim();
  if (/^(hi|hello|hey)\b/.test(q) || /^good (morning|afternoon|evening)/.test(q))
    return `Hello! I'm the **uxproof research assistant**.\n\nI can help you with:\n\n• **Analyse a quarter** — _"Analyse Q3 2025"_ or _"What is the SUS score for Q4 2025?"_\n• **Compare periods** — _"Compare Q3 vs Q4 2025"_\n• **Full year overviews** — _"Full year 2025 overview"_\n• **Generate presentations** — _"Generate Q4 2025 presentation"_ or _"Generate 2025 presentation"_\n• **Deep AI analysis** — _"Deep analysis Q3 2025"_\n\nWhat would you like to explore?`;
  if (/how (can|do) you help/.test(q) || /what can you do/.test(q) || /^help\b/.test(q))
    return `I'm the **uxproof research assistant** — I turn UX research data into client-ready insights and presentations.\n\n**I can:**\n\n• Query SUS, task success, NPS, error-rate and conversion data from any quarter\n• Compare two periods side by side\n• Run AI-powered deep analysis via the agent pipeline\n• Generate 8-slide .pptx research decks\n\n**Try:**\n\n• _"What is the SUS score for Q4 2025?"_\n• _"Compare Q3 vs Q4 2025"_\n• _"Generate 2025 presentation"_`;
  if (/who are you/.test(q)) return `I'm the **uxproof research assistant**. Try: _"Generate Q4 2025 presentation"_ or _"Analyse Q3 2025"_`;
  if (/^how are you/.test(q)) return `Ready to help with your UX research reporting! Try: _"Analyse Q3 2025"_`;
  if (/^(thanks|thank you)/.test(q)) return `You're welcome! Let me know if you need any other analysis or a presentation.`;
  if (/^(can you|are you able to|do you)\b/.test(q))
    return `Yes — I can generate presentations for either scope:\n\n• **Single quarter** — _"Generate Q2 2025 presentation"_ → 8-slide deck focused on that quarter's research\n• **Full year** — _"Generate 2025 presentation"_ → 8-slide deck aggregating all quarters of that year\n\nI can also compare multiple periods side by side. What would you like?`;
  return `I can help you analyse UX research data and generate presentations. Try: _"Analyse Q3 2025"_`;
}

// ─── Intent + scope detection ────────────────────────────────────────────────

type ResponseIntent = 'analysis' | 'comparison' | 'presentation' | 'metric';

function detectResponseIntent(query: string): ResponseIntent {
  const q = query.toLowerCase();
  if (/\bpresentation|powerpoint|pptx|slides|deck\b/.test(q)) return 'presentation';
  if (/\bvs\.?|versus|compare|comparison\b/.test(q)) return 'comparison';
  // Precise-metric questions: "what is the SUS score for Q2", "show me the NPS"
  if (detectMetricIntent(q) !== null) return 'metric';
  return 'analysis';
}

/**
 * Identify if the user is asking about a SINGLE named metric. Returns the
 * canonical metric key when matched, otherwise null. Used to decide
 * between a focused "SUS score for Q3 2025: 79.4 (+1.5 pts)" answer
 * and a full research report dump.
 */
type MetricKey =
  | 'susScore' | 'susChange' | 'taskSuccessRate' | 'npsScore'
  | 'participants' | 'errorRate' | 'conversionRate';

function detectMetricIntent(q: string): MetricKey | null {
  // Only treat as a metric question if the query is short-ish AND
  // hits exactly one metric phrase. Long sentences likely want analysis.
  const isShort = q.trim().split(/\s+/).length <= 14;
  if (!isShort) return null;
  let hits = 0;
  let pick: MetricKey | null = null;
  const tests: Array<[RegExp, MetricKey]> = [
    [/\b(sus change|sus (gain|delta|movement))\b/,        'susChange'],
    [/\b(task success|success rate|completion rate)\b/,   'taskSuccessRate'],
    [/\b(nps|net promoter)\b/,                            'npsScore'],
    [/\b(error rate|errors?)\b/,                          'errorRate'],
    [/\b(conversion|conversion rate)\b/,                  'conversionRate'],
    [/\b(participants?|sample size|testers?|users? tested)\b/, 'participants'],
    [/\b(sus|usability score)\b/,                         'susScore'],
  ];
  for (const [re, key] of tests) {
    if (re.test(q)) { hits++; pick = key; }
  }
  return hits === 1 ? pick : null;
}

type PresentationScope = 'quarter' | 'year';

/**
 * "Generate 2025 presentation" → year scope.
 * "Generate Q2 2025 presentation" → quarter scope.
 * "Generate the latest presentation" → quarter (default).
 */
function detectPresentationScope(query: string): PresentationScope {
  const q = query.toLowerCase();
  const hasQuarter = /\bq[1-4]\b/.test(q);
  const hasYear    = /\b20\d{2}\b/.test(q);
  if (hasYear && !hasQuarter) return 'year';
  return 'quarter';
}

/**
 * Detect a data-shaped request that's MISSING a period anchor.
 *
 *   "give me the usability issues"      → needs clarification
 *   "what are the recommendations"      → needs clarification
 *   "show me KPIs"                      → needs clarification
 *   "usability issues for Q3 2025"      → fine, period present
 */
function needsPeriodClarification(query: string): { needed: boolean; topic: string } {
  const q = query.toLowerCase().trim();

  // Period anchors of any kind → no clarification needed
  if (/\bq[1-4]\b|\b20\d{2}\b|\blast (quarter|year|month)\b|\bthis (quarter|year)\b|\bytd\b|\bfull year\b|\ball (quarters|periods|data)\b|\beach quarter\b/.test(q)) {
    return { needed: false, topic: '' };
  }
  // Comparison / presentation / casual queries handled elsewhere
  if (/\b(compare|vs\.?|versus|presentation|powerpoint|pptx|deck|slides)\b/.test(q)) {
    return { needed: false, topic: '' };
  }

  // Topic detection — only ask when the data shape is clear
  const topics: Array<[RegExp, string]> = [
    [/\b(usability )?issues?\b|\bfindings?\b/, 'usability issues'],
    [/\brecommendations?\b/,             'recommendations'],
    [/\b(research )?insights?\b/,        'research insights'],
    [/\bkpis?\b|\bkey (ux )?indicators/, 'KPIs'],
    [/\bsus\b|\busability score\b/,      'SUS score'],
    [/\btask success\b/,                 'task success rate'],
    [/\bnps\b|\bnet promoter\b/,         'NPS'],
    [/\berror rate\b/,                   'error rate'],
    [/\bconversion\b/,                   'conversion rate'],
    [/\bparticipants?\b/,                'participant data'],
  ];
  for (const [re, topic] of topics) {
    if (re.test(q)) return { needed: true, topic };
  }
  return { needed: false, topic: '' };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const sign = (n: number) => n >= 0 ? '+' : '';
const pp   = (n: number) => `${sign(n)}${n}pp`;
const pts  = (n: number) => `${sign(n)}${n} pts`;
const pct  = (n: number) => `${sign(n)}${n}%`;
const arrow = (t: 'up' | 'down' | 'stable') => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
const sev: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };

/**
 * displayPeriod — user-facing label for a period string.
 *   "Full Year 2025" → "2025"
 *   "Q3 2025"        → "Q3 2025"  (unchanged)
 */
const displayPeriod = (p: string): string =>
  p.replace(/^(Full Year|FY)\s+/i, '');

// ─── Precise metric responses ────────────────────────────────────────────────

const METRIC_LABEL: Record<MetricKey, string> = {
  susScore:        'SUS Score',
  susChange:       'SUS Change',
  taskSuccessRate: 'Task Success Rate',
  npsScore:        'NPS',
  participants:    'Research Participants',
  errorRate:       'Task Error Rate',
  conversionRate:  'Conversion Rate',
};

function formatMetric(r: SanityReport, key: MetricKey): string {
  switch (key) {
    case 'susScore':        return `${r.susScore} / 100`;
    case 'susChange':       return `${sign(r.susChange)}${r.susChange} pts`;
    case 'taskSuccessRate': return `${r.taskSuccessRate}%`;
    case 'npsScore':        return `${sign(r.npsScore)}${r.npsScore}`;
    case 'participants':    return r.participants.toLocaleString();
    case 'errorRate':       return `${r.errorRate}%`;
    case 'conversionRate':  return `${r.conversionRate}%`;
  }
}

function deltaFor(p: SanityReport, c: SanityReport | undefined, key: MetricKey): string {
  if (!c) return '';
  const dval = (() => {
    switch (key) {
      case 'susScore':        return p.susScore - c.susScore;
      case 'susChange':       return p.susChange - c.susChange;
      case 'taskSuccessRate': return p.taskSuccessRate - c.taskSuccessRate;
      case 'npsScore':        return p.npsScore - c.npsScore;
      case 'participants':    return ((p.participants - c.participants) / Math.abs(c.participants)) * 100;
      case 'errorRate':       return p.errorRate - c.errorRate;
      case 'conversionRate':  return p.conversionRate - c.conversionRate;
    }
  })();
  const r = Math.round(dval * 10) / 10;
  const rendered =
    key === 'participants' ? pct(r) :
    key === 'susScore' || key === 'npsScore' || key === 'susChange' ? pts(r) :
    pp(r);
  return ` _(${rendered} vs ${c.quarter} ${c.year})_`;
}

function buildPreciseMetric(ctx: ReportContext, key: MetricKey): string {
  if (ctx.mode === 'year' || ctx.mode === 'year-comparison' || ctx.mode === 'all') {
    // Year scope — aggregate value
    const agg = ctx.aggregated;
    if (!agg) return 'No data for that scope.';
    const yearVal = (() => {
      switch (key) {
        case 'susScore':        return `${agg.avgSusScore} / 100 (average across quarters)`;
        case 'susChange':       return `${sign(agg.avgSusChange)}${agg.avgSusChange} pts (average QoQ movement)`;
        case 'taskSuccessRate': return `${agg.avgTaskSuccessRate}% (average)`;
        case 'npsScore':        return `${sign(agg.avgNpsScore)}${agg.avgNpsScore} (average)`;
        case 'participants':    return `${agg.totalParticipants.toLocaleString()} (full year total)`;
        case 'errorRate':       return `${agg.avgErrorRate}% (average)`;
        case 'conversionRate':  return `${agg.avgConversionRate}% (average)`;
      }
    })();
    return `**${METRIC_LABEL[key]} — ${ctx.period}**\n\n${yearVal}\n\n_Ask for a full overview or a presentation if you need more detail._`;
  }

  const p = ctx.primary;
  if (!p) return `No data found for **${ctx.period}**.`;
  const value = formatMetric(p, key);
  const dStr  = deltaFor(p, ctx.comparison, key);
  return `**${METRIC_LABEL[key]} — ${ctx.period}**\n\n${value}${dStr}\n\n_Ask me for the full report or a presentation if you need more context._`;
}

// ─── Block builders (used by the full-analysis path) ─────────────────────────

function kpiBlock(r: SanityReport): string {
  return r.kpis.length
    ? r.kpis.map(k => `• ${k.label}: **${k.value}** ${arrow(k.trend)} ${sign(k.change)}${k.change}%`).join('\n')
    : `• SUS Score: **${r.susScore} / 100** (${pts(r.susChange)})\n• Task Success: **${r.taskSuccessRate}%**\n• NPS: **${sign(r.npsScore)}${r.npsScore}**\n• Error Rate: **${r.errorRate}%**`;
}

function insightBlock(r: SanityReport): string {
  return r.insights.length
    ? r.insights.map(i => `**${i.title}**\n  ${i.summary}`).join('\n\n')
    : '_No insights for this period._';
}

function issueBlock(r: SanityReport): string {
  return r.issues.length
    ? r.issues.map(issue =>
        `• ${sev[issue.severity] || '•'} **${issue.title}**\n  ${issue.description}\n  _Recommendation: ${issue.recommendation}_`
      ).join('\n\n')
    : '_No issues for this period._';
}

function aggSummary(agg: AggregatedMetrics, label: string): string {
  return `**${label} — Aggregated Metrics**\n• Avg SUS Score: **${agg.avgSusScore} / 100**\n• Avg Task Success: **${agg.avgTaskSuccessRate}%**\n• Avg NPS: **${sign(agg.avgNpsScore)}${agg.avgNpsScore}**\n• Participants (total): **${agg.totalParticipants.toLocaleString()}**\n• Avg Error Rate: **${agg.avgErrorRate}%**\n• Avg Conversion Rate: **${agg.avgConversionRate}%**`;
}

function quarterTable(reports: SanityReport[]): string {
  const sorted = [...reports].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.quarter.localeCompare(b.quarter)
  );
  return [
    '| Quarter | SUS | Task Success | NPS | Error Rate | Participants |',
    '|---|---|---|---|---|---|',
    ...sorted.map(r => `| ${r.quarter} ${r.year} | ${r.susScore} | ${r.taskSuccessRate}% | ${sign(r.npsScore)}${r.npsScore} | ${r.errorRate}% | ${r.participants} |`),
  ].join('\n');
}

function allInsights(reports: SanityReport[]): string {
  const items = reports.flatMap(r =>
    r.insights.map(i => `• **${r.quarter} ${r.year} — ${i.title}**\n  ${i.summary}`)
  );
  return items.length ? items.join('\n\n') : '_No insights available._';
}

function topIssues(reports: SanityReport[]): string {
  const all  = reports.flatMap(r => r.issues.map(issue => ({ ...issue, period: `${r.quarter} ${r.year}` })));
  const high = all.filter(r => r.severity === 'high');
  const med  = all.filter(r => r.severity === 'medium');
  return [...high, ...med].slice(0, 6)
    .map(r => `• ${sev[r.severity] || '•'} **${r.title}** _(${r.period})_\n  ${r.description}\n  _Recommendation: ${r.recommendation}_`)
    .join('\n\n') || '_No issues available._';
}

// ─── Full-analysis response builders ─────────────────────────────────────────

function buildSingle(ctx: ReportContext): string {
  const { primary: r, comparison: c, delta: d, period, comparisonPeriod } = ctx;
  if (!r) return `No data found for **${period}**. Check that this period exists in Sanity CMS.`;

  const compNote = c && d
    ? `\n_vs ${comparisonPeriod}: SUS ${pts(d.susScore)}, Task Success ${pp(d.taskSuccessRate)}, NPS ${pts(d.npsScore)}_`
    : '';

  const engagement = r.client
    ? `\n_${r.client} · ${r.product} · ${r.methods?.join(', ') || ''}_\n`
    : '';

  return `**${period} UX Research Report**${compNote}\n${engagement}\n---\n\n**Key UX Indicators**\n${kpiBlock(r)}\n\n---\n\n**Research Insights**\n${insightBlock(r)}\n\n---\n\n**Usability Issues**\n${issueBlock(r)}\n\n---\n_Ask me to compare with another period or generate a presentation._`;
}

function buildComparison(ctx: ReportContext): string {
  const { primary: p, comparison: c, delta: d, period, comparisonPeriod } = ctx;
  if (!p || !c || !d) return buildSingle(ctx);

  return `**${comparisonPeriod} → ${period}**\n\n| Metric | ${comparisonPeriod} | ${period} | Change |\n|---|---|---|---|\n| SUS Score | ${c.susScore} | ${p.susScore} | ${pts(d.susScore)} |\n| Task Success | ${c.taskSuccessRate}% | ${p.taskSuccessRate}% | ${pp(d.taskSuccessRate)} |\n| NPS | ${sign(c.npsScore)}${c.npsScore} | ${sign(p.npsScore)}${p.npsScore} | ${pts(d.npsScore)} |\n| Error Rate | ${c.errorRate}% | ${p.errorRate}% | ${pp(d.errorRate)} |\n| Participants | ${c.participants} | ${p.participants} | ${pct(d.participants)} |\n| Conversion Rate | ${c.conversionRate}% | ${p.conversionRate}% | ${pp(d.conversionRate)} |\n\n**${period} Insights**\n${insightBlock(p)}\n\n**${comparisonPeriod} Insights**\n${insightBlock(c)}`;
}

function buildYear(ctx: ReportContext): string {
  const { reports = [], aggregated, period } = ctx;
  const yearNum  = parseInt(period.match(/\b(20\d{2})\b/)?.[1] ?? '0');
  const filtered = yearNum ? reports.filter(r => r.year === yearNum) : reports;
  if (!filtered.length) return `No data found for **${period}**.`;
  return `**${period}**\n\n${aggregated ? aggSummary(aggregated, period) : ''}\n\n---\n\n**Quarter-by-Quarter**\n${quarterTable(filtered)}\n\n---\n\n**Key Insights**\n${allInsights(filtered)}\n\n---\n\n**Top Issues**\n${topIssues(filtered)}\n\n---\n_Ask me to drill into a specific quarter or generate a presentation._`;
}

function buildYearComparison(ctx: ReportContext): string {
  const { reports = [], aggregated, comparisonReports = [], comparisonAggregated, delta, period, comparisonPeriod } = ctx;
  if (!aggregated || !comparisonAggregated || !delta) return 'Insufficient data for comparison.';
  return `**${comparisonPeriod} vs ${period}**\n\n| Metric | ${comparisonPeriod} | ${period} | Change |\n|---|---|---|---|\n| Avg SUS | ${comparisonAggregated.avgSusScore} | ${aggregated.avgSusScore} | ${pts(delta.susScore)} |\n| Avg Task Success | ${comparisonAggregated.avgTaskSuccessRate}% | ${aggregated.avgTaskSuccessRate}% | ${pp(delta.taskSuccessRate)} |\n| Avg NPS | ${sign(comparisonAggregated.avgNpsScore)}${comparisonAggregated.avgNpsScore} | ${sign(aggregated.avgNpsScore)}${aggregated.avgNpsScore} | ${pts(delta.npsScore)} |\n| Participants | ${comparisonAggregated.totalParticipants} | ${aggregated.totalParticipants} | ${pct(delta.participants)} |\n| Avg Error Rate | ${comparisonAggregated.avgErrorRate}% | ${aggregated.avgErrorRate}% | ${pp(delta.errorRate)} |\n\n**${period} — Quarters**\n${quarterTable(reports)}\n\n**${comparisonPeriod} — Quarters**\n${quarterTable(comparisonReports)}`;
}

function buildMulti(ctx: ReportContext): string {
  const { reports = [], aggregated, period } = ctx;
  return `**${period}**\n\n${aggregated ? aggSummary(aggregated, period) : ''}\n\n---\n\n**Period Breakdown**\n${quarterTable(reports)}\n\n---\n\n**Insights**\n${allInsights(reports)}\n\n---\n\n**Issue Highlights**\n${topIssues(reports)}`;
}

function buildAll(ctx: ReportContext): string {
  const { reports = [], aggregated } = ctx;
  const years  = [...new Set(reports.map(r => r.year))].sort();
  const byYear = years.map(y => {
    const yr = reports.filter(r => r.year === y);
    return `**${y}** — Avg SUS: ${(yr.reduce((s, r) => s + r.susScore, 0) / yr.length).toFixed(1)} | Avg Task Success: ${(yr.reduce((s, r) => s + r.taskSuccessRate, 0) / yr.length).toFixed(1)}%`;
  });
  return `**Full Dataset Overview** (${reports.length} quarters)\n\n${aggregated ? aggSummary(aggregated, 'All Periods') : ''}\n\n---\n\n**Annual Summary**\n${byYear.join('\n')}\n\n---\n\n**All Quarters**\n${quarterTable(reports)}\n\n---\n_Ask me to focus on a specific year or generate a presentation._`;
}

// ─── Presentation response — short summary + CTA ─────────────────────────────

/**
 * Presentation requests get a CONTEXTUAL but SHORT summary, not the
 * full research report dump.
 *
 *   "Generate Q2 2025 presentation" →
 *      "Generating Q2 2025 presentation. SUS 77.9 (+1.9 pts QoQ),
 *       task success 82.8%. Click below to download."
 *
 *   "Generate 2025 presentation" →
 *      "Generating 2025 full-year presentation across Q1-Q4. Avg SUS
 *       78.6, avg task success 83.9%. Click below to download."
 */
function buildPresentationPreview(ctx: ReportContext, scope: PresentationScope): string {
  // Year scope
  if (scope === 'year' || ctx.mode === 'year' || ctx.mode === 'year-comparison') {
    const agg = ctx.aggregated;
    const yearNum = parseInt(ctx.period.match(/\b(20\d{2})\b/)?.[1] ?? '0');
    const quarters = (ctx.reports || []).filter(r => !yearNum || r.year === yearNum);
    const qCount = quarters.length;
    const label = displayPeriod(ctx.period);

    if (!agg || qCount === 0) {
      return `**Generating ${label} presentation**\n\n8-slide research deck — building from full-year data. Generation is starting below; the download button appears when it’s ready.`;
    }

    return `**Generating ${label} full-year presentation**\n\nAggregating **${qCount} quarter${qCount === 1 ? '' : 's'}**: avg SUS **${agg.avgSusScore}**, avg task success **${agg.avgTaskSuccessRate}%**, **${agg.totalParticipants.toLocaleString()}** research participants.\n\n8-slide research deck — generating now, the download button appears below when it’s ready.`;
  }

  // Quarter scope
  const r = ctx.primary;
  if (!r) {
    return `**Generating ${displayPeriod(ctx.period)} presentation**\n\n8-slide research deck — generating now, the download button appears below when it’s ready.`;
  }
  const susNote = ctx.delta
    ? `, ${pts(ctx.delta.susScore)} vs ${ctx.comparisonPeriod}`
    : '';
  return `**Generating ${displayPeriod(ctx.period)} presentation**\n\nSUS **${r.susScore}** (${pts(r.susChange)} QoQ${susNote}), task success **${r.taskSuccessRate}%**, NPS **${sign(r.npsScore)}${r.npsScore}**.\n\n8-slide research deck — generating now, the download button appears below when it’s ready.`;
}

function buildResponse(
  ctx: ReportContext,
  intent: ResponseIntent,
  scope: PresentationScope,
  metricKey: MetricKey | null,
): string {
  if (intent === 'presentation') return buildPresentationPreview(ctx, scope);
  if (intent === 'metric' && metricKey) return buildPreciseMetric(ctx, metricKey);
  switch (ctx.mode) {
    case 'single':          return buildSingle(ctx);
    case 'comparison':      return buildComparison(ctx);
    case 'year':            return buildYear(ctx);
    case 'year-comparison': return buildYearComparison(ctx);
    case 'half-year':       return buildMulti(ctx);
    case 'multi-quarter':   return buildMulti(ctx);
    case 'all':             return buildAll(ctx);
    default:                return buildSingle(ctx);
  }
}

// ─── Period-clarification response ───────────────────────────────────────────

function buildPeriodClarification(topic: string): string {
  return `Which period would you like the **${topic}** for?\n\nFor example:\n\n• _"Give me ${topic} for Q3 2025"_\n• _"Show me ${topic} for full year 2025"_\n• _"Compare ${topic} for Q2 vs Q3 2025"_`;
}

// ─── Year-scope hint injection ───────────────────────────────────────────────

/**
 * If the user asked for a year-scope presentation but the underlying
 * resolveReportContext came back single-quarter (most-recent of the
 * year), we rewrite the query to force the year route. This keeps
 * "Generate 2025 presentation" from silently producing a Q4 deck.
 */
function ensureYearScopeQuery(query: string): string {
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (!yearMatch) return query;
  const hasQuarter = /\bq[1-4]\b/i.test(query);
  if (hasQuarter) return query;
  if (/\bfull year\b/i.test(query)) return query;
  return query.replace(/\b(20\d{2})\b/, 'full year $1');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function processQuery(context: AIContext, query: string, userId: string): Promise<AIResponse> {
  const t0 = Date.now();

  // ── 1. Casual / meta — no Sanity, no contextRef ────────────────────────
  if (isCasualOrMeta(query)) {
    return {
      id:        Date.now().toString(),
      role:      'assistant',
      content:   buildCasualResponse(query),
      timestamp: new Date(),
      agentInfo: { agent: 'uxproof assistant', processingTime: '0.0s' },
      contextRef: undefined,
    };
  }

  // ── 2. Missing-period guard ─────────────────────────────────────────────
  const clarif = needsPeriodClarification(query);
  if (clarif.needed) {
    return {
      id:        Date.now().toString(),
      role:      'assistant',
      content:   buildPeriodClarification(clarif.topic),
      timestamp: new Date(),
      agentInfo: { agent: 'uxproof assistant', processingTime: '0.0s' },
      contextRef: undefined,
    };
  }

  // ── 3. Sanity config check ─────────────────────────────────────────────
  const configError = checkSanityConfig();
  if (configError) {
    return {
      id:        Date.now().toString(),
      role:      'assistant',
      content:   `**Configuration error:** ${configError}\n\nPlease add the missing environment variables to your \`.env.local\` file and restart the dev server.`,
      timestamp: new Date(),
      agentInfo: { agent: 'uxproof assistant', processingTime: '0.0s' },
      contextRef: undefined,
    };
  }

  // ── 4. Detect intent + scope ───────────────────────────────────────────
  const intent     = detectResponseIntent(query);
  const scope      = detectPresentationScope(query);
  const metricKey  = intent === 'metric' ? detectMetricIntent(query.toLowerCase()) : null;

  // Force year-scope routing for "Generate <year> presentation"
  const effectiveQuery = (intent === 'presentation' && scope === 'year')
    ? ensureYearScopeQuery(query)
    : query;

  // ── 5. Resolve context from Sanity — scoped to this user's reports ─────
  let ctx: ReportContext | null = null;
  try {
    ctx = await resolveReportContext(effectiveQuery, userId);
  } catch (e) {
    console.error('[unified-agent] resolveReportContext error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id:        Date.now().toString(),
      role:      'assistant',
      content:   `**Database query failed.** ${msg}\n\nCheck your Sanity environment variables and that the agent service can reach \`${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}.api.sanity.io\`.`,
      timestamp: new Date(),
      agentInfo: { agent: 'uxproof assistant', processingTime: `${((Date.now() - t0) / 1000).toFixed(1)}s` },
      contextRef: undefined,
    };
  }

  const elapsed = `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  if (!ctx) {
    return {
      id:        Date.now().toString(),
      role:      'assistant',
      content:   `I couldn't find research data for that period in your workspace.\n\nAll answers are grounded in the reports **you upload** — use the **+** button next to the chat input to add one (CSV, JSON, TXT, Markdown or PDF; I extract the research data automatically), then ask again. You can also ask _"what data do I have?"_ to see the periods already available.`,
      timestamp: new Date(),
      agentInfo: { agent: 'uxproof assistant', processingTime: elapsed },
      contextRef: undefined,
    };
  }

  const processingType =
    intent === 'presentation'                                            ? 'presentation'
    : intent === 'metric'                                                ? 'analysis'
    : ctx.mode === 'comparison' || ctx.mode === 'year-comparison'       ? 'comparison'
    : 'analysis';

  return {
    id:               Date.now().toString(),
    role:             'assistant',
    content:          buildResponse(ctx, intent, scope, metricKey),
    timestamp:        new Date(),
    agentInfo:        { agent: 'uxproof assistant', processingTime: elapsed },
    contextRef:       { project: context.projectId, quarter: displayPeriod(ctx.period) },
    showPresentation: intent === 'presentation',
    processingType:   processingType as 'analysis' | 'comparison' | 'presentation',
    // Pass scope through so the API route can call the right pipeline.
    presentationScope: intent === 'presentation' ? scope : undefined,
  };
}

export function createUnifiedAI(context: AIContext, userId: string) {
  return { processQuery: (query: string) => processQuery(context, query, userId) };
}
