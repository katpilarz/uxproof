// lib/ppt/deck-data.ts
//
// Decides WHAT goes in the deck. Rendering is elsewhere.
//
// The Dossier template is a library of slide types, not a running order —
// the spec says so outright. A slide is emitted only when the data it
// needs exists, so a workspace holding nothing but a SUS score produces a
// short honest deck rather than a long one padded with empty frames.
//
// The gate is DELIBERATELY DETERMINISTIC. Slide presence is a function of
// the data alone: same data in, same deck out, every time. The model's job
// is unchanged — it selects and phrases the content that goes on a slide,
// it never decides the deck's structure. That keeps "the LLM never invents
// data" true of the shape of the deck as well as its numbers.
//
// Input is the persisted Sanity slidePlan, treated purely as a data
// envelope: its content blocks carry the report's metrics, issues and
// recommendations, and this module re-organises them. Nothing here depends
// on the planning agent's slide count or ordering.

// ─── Harvested data ───────────────────────────────────────────────────────────

export interface Metric {
  label:   string;
  value:   string;
  change?: number;
  trend?:  string;
}

export interface Finding {
  title:        string;
  severity?:    'high' | 'medium' | 'low' | string;
  description?: string;
}

export interface Recommendation {
  title:        string;
  description?: string;
}

export interface TrendSeries {
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
}

export interface DeckData {
  period:          string;
  metrics:         Metric[];
  findings:        Finding[];
  recommendations: Recommendation[];
  trend?:          TrendSeries;
  narrative?:      string;
  /** Detail straight from the report — the plan does not carry these. */
  tasks:              TaskResult[];
  participantScores:  ParticipantScore[];
  quotes:             Quote[];
}

// ─── Slides the deck can contain ─────────────────────────────────────────────

export type DeckSlide =
  | { kind: 'cover';            title: string; period: string; meta: Array<{ label: string; value: string }> }
  | { kind: 'contents';         rows: Array<{ number: string; title: string; sub: string }> }
  | { kind: 'exec-summary';     findings: Finding[]; closing?: string }
  | { kind: 'glance';           metrics: Metric[] }
  | { kind: 'divider';          numeral: string; title: string; standfirst: string }
  | { kind: 'finding';          index: number; finding: Finding; quote?: Quote }
  | { kind: 'findings-summary'; findings: Finding[]; headline: string; gloss: string }
  | { kind: 'trend';            trend: TrendSeries }
  | { kind: 'task-performance'; tasks: TaskResult[] }
  | { kind: 'sus-participants'; scores: ParticipantScore[]; benchmark: number }
  | { kind: 'indicators';       metrics: Metric[] }
  | { kind: 'recommendations';  items: Recommendation[] }
  | { kind: 'appendix';         terms: Array<{ term: string; definition: string }> };

// ─── Harvest ──────────────────────────────────────────────────────────────────

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num  = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A content block as the planning agent persists it — loose by nature. */
interface PlanBlock { _type?: string; [key: string]: unknown }
interface PlanSlide { content?: unknown }
interface Plan      { slides?: unknown }

/** Pull every content block of a type out of the plan, in slide order. */
function blocks(plan: unknown, type: string): PlanBlock[] {
  const slides = (plan as Plan | null)?.slides;
  if (!Array.isArray(slides)) return [];
  return slides
    .flatMap((s: PlanSlide) => (Array.isArray(s?.content) ? (s.content as PlanBlock[]) : []))
    .filter(b => b && b._type === type);
}

/**
 * What the SOURCE REPORT actually contains. The plan is not evidence:
 * asked about a period whose report carries no issues at all, the planning
 * agent still emits issueItem and priorityItem blocks, and a gate that
 * trusted the plan would dutifully build a Findings section out of them.
 *
 * These counts are the ceiling. A finding can only reach the deck if the
 * report it claims to come from actually recorded one.
 */
export interface TaskResult {
  code:         string;
  name?:        string;
  successRate?: number;
  medianTime?:  string;
  errors?:      number;
}

export interface ParticipantScore { participant: string; score: number }
export interface Quote { text: string; attribution?: string }

export interface Grounding {
  issues:   number;
  insights: number;
  /** Per-task results — the Task Performance slide is built from these. */
  tasks?:             TaskResult[];
  /** Per-participant SUS — the SUS by Participant slide. */
  participantScores?: ParticipantScore[];
  /** Verbatim quotes — a finding slide carries one as its evidence. */
  quotes?:            Quote[];
  /**
   * Metric fields the report actually recorded a value for. The planning
   * agent emits a kpiItem per metric slot whether or not the report has
   * one, which is how a deck ends up with an "NPS +0" card for a study
   * that never measured NPS.
   */
  metrics?: string[];
}

/**
 * Which report field a plan's KPI label refers to. Labels are model-written
 * ("NPS", "Net Promoter Score", "Task Success Rate"), so they are matched
 * by pattern rather than compared literally.
 */
const METRIC_FIELDS: Array<{ field: string; match: RegExp }> = [
  { field: 'susScore',        match: /\bsus\b|usability scale/i },
  { field: 'susChange',       match: /sus (change|delta|movement)/i },
  { field: 'taskSuccessRate', match: /task success/i },
  { field: 'npsScore',        match: /\bnps\b|net promoter/i },
  { field: 'participants',    match: /participant/i },
  { field: 'errorRate',       match: /error rate/i },
  { field: 'conversionRate',  match: /conversion/i },
];

/** The report field a label names, or null when it names none of them. */
function fieldFor(label: string): string | null {
  return METRIC_FIELDS.find(m => m.match.test(label))?.field ?? null;
}

export function harvestDeckData(plan: unknown, period: string, grounding?: Grounding): DeckData {
  // The same KPI often appears on more than one slide of the plan (a
  // headline figure and again in a dashboard). Keep the first of each
  // label so a metric is never counted twice.
  const seen = new Set<string>();
  const metrics: Metric[] = [];
  for (const b of blocks(plan, 'kpiItem')) {
    const label = text(b.label);
    const value = text(b.value);
    if (!label || !value) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push({
      label, value,
      change: num(b.change),
      trend:  text(b.trend) || undefined,
    });
  }

  const findings: Finding[] = blocks(plan, 'issueItem')
    .map(b => ({
      title:       text(b.title),
      severity:    text(b.severity) || undefined,
      description: text(b.description) || undefined,
    }))
    .filter(f => f.title);

  const recommendations: Recommendation[] = blocks(plan, 'priorityItem')
    .map(b => ({ title: text(b.title), description: text(b.description) || undefined }))
    .filter(r => r.title);

  // A trend needs at least two points to be a trend.
  interface ChartSeries { name?: unknown; labels?: unknown; values?: unknown }
  let trend: TrendSeries | undefined;
  for (const b of blocks(plan, 'chartBlock')) {
    const data: ChartSeries[] = Array.isArray(b.chartData) ? (b.chartData as ChartSeries[]) : [];
    const usable = data.filter(d => Array.isArray(d?.values) && (d.values as unknown[]).length >= 2);
    if (!usable.length) continue;
    trend = {
      labels: (Array.isArray(usable[0].labels) ? usable[0].labels : []).map(text),
      series: usable.map(d => ({
        name:   text(d.name) || 'Series',
        values: (d.values as unknown[]).map(v => num(v) ?? 0),
      })),
    };
    break;
  }

  const narrative = blocks(plan, 'subtitleBlock')
    .map(b => text(b.text))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];

  // Drop metrics the report has no value for. A label this doesn't
  // recognise is left alone — it may be a legitimate custom indicator, and
  // silently deleting it would be worse than showing it.
  const cappedMetrics = grounding?.metrics
    ? metrics.filter(m => {
        const field = fieldFor(m.label);
        return field === null || grounding.metrics!.includes(field);
      })
    : metrics;

  // Clip to what the report actually recorded. Recommendations may come
  // from an issue's own recommendation field as well as from insights, so
  // their ceiling is the sum.
  const cappedFindings = grounding
    ? findings.slice(0, Math.max(0, grounding.issues))
    : findings;
  const cappedRecs = grounding
    ? recommendations.slice(0, Math.max(0, grounding.issues + grounding.insights))
    : recommendations;

  if (grounding && (cappedFindings.length < findings.length || cappedRecs.length < recommendations.length)) {
    console.warn(
      '[deck] plan carried more findings/recommendations than the report records —',
      `findings ${findings.length}→${cappedFindings.length},`,
      `recommendations ${recommendations.length}→${cappedRecs.length}`,
    );
  }

  return {
    period, trend, narrative,
    metrics:         cappedMetrics,
    findings:        cappedFindings,
    recommendations: cappedRecs,
    // Straight from the report, already validated against the source
    // document at upload time — the plan never sees these.
    tasks:             grounding?.tasks ?? [],
    participantScores: grounding?.participantScores ?? [],
    quotes:            grounding?.quotes ?? [],
  };
}

// ─── Definitions (appendix) ──────────────────────────────────────────────────
//
// Only terms the deck actually used are defined; an appendix explaining a
// metric that never appeared is noise.

const GLOSSARY: Array<{ match: RegExp; term: string; definition: string }> = [
  { match: /\bsus\b|usability scale/i, term: 'SUS',
    definition: 'System Usability Scale — ten items, 0–100. 68 is the published average; 80 or above reads as excellent.' },
  { match: /task success/i, term: 'Task success',
    definition: 'Completed without moderator help. Times are medians across completers only.' },
  { match: /\bnps\b|net promoter/i, term: 'NPS',
    definition: 'Net Promoter Score — likelihood to recommend, reported from −100 to +100.' },
  { match: /error rate/i, term: 'Error rate',
    definition: 'Share of task attempts in which a participant took a wrong action or had to recover.' },
  { match: /conversion/i, term: 'Conversion',
    definition: 'Share of participants completing the key flow end to end without abandoning it.' },
  { match: /participant/i, term: 'Participants',
    definition: 'People who completed a session in this round. Counts exclude no-shows and pilots.' },
];

function definitionsFor(metrics: Metric[]) {
  const haystack = metrics.map(m => `${m.label} ${m.value}`).join(' ');
  return GLOSSARY
    .filter(g => g.match.test(haystack))
    .map(({ term, definition }) => ({ term, definition }));
}

// ─── The gate ─────────────────────────────────────────────────────────────────

/** How many metric cards the "Study at a Glance" row holds (spec: four). */
const GLANCE_CARDS = 4;
/** The spec's finding slides are one per finding; four is the documented set. */
const MAX_FINDINGS = 4;

/**
 * Build the deck. Every rule below is "is the data there?" — nothing is
 * emitted speculatively, and nothing is padded to reach a slide count.
 */
export function buildDeck(data: DeckData): DeckSlide[] {
  const { period, metrics, findings, recommendations, trend, narrative } = data;
  const { tasks, participantScores, quotes } = data;

  const shownFindings = findings.slice(0, MAX_FINDINGS);
  const glanceMetrics = metrics.slice(0, GLANCE_CARDS);
  const extraMetrics  = metrics.slice(GLANCE_CARDS);

  const hasFindings = shownFindings.length > 0;
  // Two tasks make a comparison; a single row is a fact already on the
  // glance slide. Three participants make a distribution worth plotting.
  const hasTasks    = tasks.length >= 2;
  const hasScores   = participantScores.length >= 3;
  const hasMeasures = !!trend || extraMetrics.length > 0 || hasTasks || hasScores;
  const hasResponse = recommendations.length > 0;

  const body: DeckSlide[] = [];

  // ── Overview ──
  if (hasFindings) {
    body.push({
      kind: 'exec-summary',
      findings: shownFindings,
      closing: narrative,
    });
  }
  if (glanceMetrics.length) {
    body.push({ kind: 'glance', metrics: glanceMetrics });
  }

  // ── Findings ── divider only when there is a section behind it
  if (hasFindings) {
    body.push({
      kind: 'divider',
      numeral: '01',
      title: 'Findings',
      standfirst: `${shownFindings.length} issue${shownFindings.length === 1 ? '' : 's'} observed in ${period}.`,
    });
    shownFindings.forEach((finding, i) => body.push({
      kind: 'finding', index: i + 1, finding,
      // One quote per finding, in order. Without one the slide is a title
      // and a description; with one it carries the participant's own words.
      quote: quotes[i],
    }));

    // The violet summary poster earns its place only with several findings
    // to collect — with one it would restate the slide before it.
    if (shownFindings.length >= 2) {
      body.push({
        kind: 'findings-summary',
        findings: shownFindings,
        headline: String(shownFindings.length),
        gloss:    `findings carry the friction observed in ${period}.`,
      });
    }
  }

  // ── Measures ──
  if (hasMeasures) {
    body.push({
      kind: 'divider',
      numeral: hasFindings ? '02' : '01',
      title: 'Measures',
      standfirst: hasTasks
        ? 'Task-level results, and how the numbers moved.'
        : trend
          ? 'How the numbers moved, period over period.'
          : 'The indicators behind the headline.',
    });
    if (hasTasks)  body.push({ kind: 'task-performance', tasks });
    if (trend)     body.push({ kind: 'trend', trend });
    if (hasScores) {
      // 68 is the published SUS average the template marks the benchmark at.
      body.push({ kind: 'sus-participants', scores: participantScores, benchmark: 68 });
    }
    if (extraMetrics.length) body.push({ kind: 'indicators', metrics: extraMetrics });
  }

  // ── Response ──
  if (hasResponse) {
    const numeral = String(1 + (hasFindings ? 1 : 0) + (hasMeasures ? 1 : 0)).padStart(2, '0');
    body.push({
      kind: 'divider',
      numeral,
      title: 'Response',
      standfirst: `${recommendations.length} recommendation${recommendations.length === 1 ? '' : 's'} from this round.`,
    });
    body.push({ kind: 'recommendations', items: recommendations });
  }

  const terms = definitionsFor(metrics);
  if (terms.length) body.push({ kind: 'appendix', terms });

  // ── Front matter ──
  const cover: DeckSlide = {
    kind:   'cover',
    title:  'UX Research Report',
    period,
    meta:   coverMeta(data),
  };

  // Contents describes the sections that actually exist. Below three body
  // slides there is nothing to navigate, so the deck opens on the content.
  const deck: DeckSlide[] = [cover];
  if (body.length >= 3) deck.push({ kind: 'contents', rows: contentsRows(body) });
  return deck.concat(body);
}

function coverMeta(data: DeckData): Array<{ label: string; value: string }> {
  const meta: Array<{ label: string; value: string }> = [{ label: 'Period', value: data.period }];
  const participants = data.metrics.find(m => /participant/i.test(m.label));
  if (participants) meta.push({ label: 'Participants', value: participants.value });
  const sus = data.metrics.find(m => /\bsus\b|usability scale/i.test(m.label));
  if (sus) meta.push({ label: 'SUS', value: sus.value });
  meta.push({ label: 'Status', value: 'Final' });
  return meta;
}

/** One contents row per section present, with its slide range. */
function contentsRows(body: DeckSlide[]): Array<{ number: string; title: string; sub: string }> {
  const rows: Array<{ number: string; title: string; sub: string }> = [];

  const overview = body.filter(s => s.kind === 'exec-summary' || s.kind === 'glance');
  if (overview.length) {
    rows.push({
      number: '00',
      title:  'Overview',
      sub:    overview.map(s => (s.kind === 'exec-summary' ? 'Executive summary' : 'Study at a glance')).join(' · '),
    });
  }
  for (const d of body.filter(s => s.kind === 'divider') as Array<Extract<DeckSlide, { kind: 'divider' }>>) {
    rows.push({ number: d.numeral, title: d.title, sub: d.standfirst });
  }
  if (body.some(s => s.kind === 'appendix')) {
    rows.push({ number: '04', title: 'Appendix', sub: 'Definitions' });
  }
  return rows;
}

// ─── Describing a deck to the UI ─────────────────────────────────────────────

/** How a slide is drawn: on the violet field, or on the ground. */
export type SlideTone = 'violet' | 'ground';

export interface SlideSummary {
  kind:  DeckSlide['kind'];
  label: string;
  tone:  SlideTone;
}

const SLIDE_LABELS: Record<DeckSlide['kind'], string> = {
  'cover':            'Cover',
  'contents':         'Contents',
  'exec-summary':     'Executive summary',
  'glance':           'Study at a glance',
  'divider':          'Section',
  'finding':          'Finding',
  'findings-summary': 'Findings summary',
  'trend':            'Trend',
  'task-performance': 'Task performance',
  'sus-participants': 'SUS by participant',
  'indicators':       'Key indicators',
  'recommendations':  'Recommendations',
  'appendix':         'Appendix',
};

/** Violet masters: the cover plate, section dividers, the statement poster. */
const VIOLET_KINDS = new Set<DeckSlide['kind']>(['cover', 'divider', 'findings-summary']);

/**
 * A deck described for the chat preview, so it shows the slides that were
 * actually built rather than a fixed set of placeholder tiles.
 */
export function describeDeck(deck: DeckSlide[]): SlideSummary[] {
  return deck.map(s => ({
    kind:  s.kind,
    // Dividers and findings name themselves; everything else is its type.
    label: s.kind === 'divider' ? s.title
         : s.kind === 'finding' ? `Finding ${s.index}`
         : SLIDE_LABELS[s.kind],
    tone:  VIOLET_KINDS.has(s.kind) ? 'violet' : 'ground',
  }));
}
