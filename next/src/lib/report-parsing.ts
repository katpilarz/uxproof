/**
 * lib/report-parsing.ts
 *
 * The deterministic half of the upload trust boundary, extracted from
 * app/api/files/route.ts so it can be unit-tested in isolation
 * (src/lib/__tests__/report-parsing.test.ts):
 *
 *   - structured parsing: JSON / CSV rows → ParsedReport, accepted only
 *     with a valid quarter (Q1–Q4), year (2000–2100) and finite susScore
 *   - the grounding gate: numberAppearsIn — a model-extracted numeric
 *     field survives only if its value appears literally in the source
 *   - salvage: recovering scalar metrics from a truncated model reply
 *
 * Everything here is pure — no I/O, no model calls, no Date. The model
 * call itself (extractReportViaModel) stays in the route; this module is
 * what its output is validated against.
 */

export interface ParsedReport {
  quarter:          string;
  year:             number;
  susScore:         number;
  susChange?:       number;
  taskSuccessRate?: number;
  npsScore?:        number;
  participants?:    number;
  errorRate?:       number;
  conversionRate?:  number;
  client?:          string;
  product?:         string;
  platform?:        string;
  methods?:         string[];
  kpis?:            unknown[];
  issues?:          unknown[];
  insights?:        unknown[];
}

export const NUMERIC_FIELDS = [
  'susScore', 'susChange', 'taskSuccessRate', 'npsScore',
  'participants', 'errorRate', 'conversionRate',
] as const;

function normKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, '');
}

// canonical field ← accepted normalized spellings
export const FIELD_ALIASES: Record<string, string[]> = {
  quarter:         ['quarter', 'q'],
  year:            ['year'],
  susScore:        ['susscore', 'sus'],
  susChange:       ['suschange', 'susdelta'],
  taskSuccessRate: ['tasksuccessrate', 'tasksuccess', 'successrate', 'completionrate'],
  npsScore:        ['npsscore', 'nps'],
  participants:    ['participants', 'samplesize', 'testers'],
  errorRate:       ['errorrate', 'errors'],
  conversionRate:  ['conversionrate', 'conversion'],
  client:          ['client'],
  product:         ['product', 'surface'],
  platform:        ['platform'],
};

function canonicalize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const byNorm = new Map(Object.entries(obj).map(([k, v]) => [normKey(k), v]));
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (byNorm.has(alias)) { out[canonical] = byNorm.get(alias); break; }
    }
  }
  // arrays pass through under their exact names
  for (const arr of ['methods', 'kpis', 'issues', 'insights']) {
    if (Array.isArray(obj[arr])) out[arr] = obj[arr];
  }
  return out;
}

export function toReport(raw: Record<string, unknown>): ParsedReport | null {
  const o = canonicalize(raw);

  const quarter = String(o.quarter ?? '').trim().toUpperCase();
  const year    = parseInt(String(o.year ?? ''), 10);
  const sus     = parseFloat(String(o.susScore ?? ''));
  if (!/^Q[1-4]$/.test(quarter) || !(year >= 2000 && year <= 2100) || !Number.isFinite(sus)) {
    return null;
  }

  const report: ParsedReport = { quarter, year, susScore: sus };
  for (const field of NUMERIC_FIELDS) {
    if (field === 'susScore') continue;
    const v = parseFloat(String(o[field] ?? ''));
    if (Number.isFinite(v)) report[field] = v;
  }
  for (const field of ['client', 'product', 'platform'] as const) {
    if (typeof o[field] === 'string' && o[field]) report[field] = o[field] as string;
  }
  if (Array.isArray(o.methods)) report.methods = (o.methods as unknown[]).map(String);

  // Typed arrays — keep only well-shaped members, stamp _key for Sanity.
  const keyed = (arr: unknown[], required: string[]) =>
    arr
      .filter((x): x is Record<string, unknown> =>
        !!x && typeof x === 'object' && required.every(f => typeof (x as Record<string, unknown>)[f] === 'string'))
      .map((x, i) => ({ _key: `k${i}`, ...x }));

  if (Array.isArray(o.kpis))     report.kpis     = keyed(o.kpis,     ['label', 'value']);
  if (Array.isArray(o.issues))   report.issues   = keyed(o.issues,   ['title', 'description']);
  if (Array.isArray(o.insights)) report.insights = keyed(o.insights, ['title', 'summary']);

  return report;
}

export function parseJsonReports(text: string): ParsedReport[] {
  try {
    const data = JSON.parse(text);
    const candidates: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.reports)
        ? (data as Record<string, unknown[]>).reports
        : [data];
    return candidates
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(toReport)
      .filter((r): r is ParsedReport => r !== null);
  } catch {
    return [];
  }
}

/** Minimal CSV split — quoted cells with embedded commas supported. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur); cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

export function parseCsvReports(text: string): ParsedReport[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1)
    .map(line => {
      const cells = splitCsvLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => { row[h] = cells[i]; });
      return toReport(row);
    })
    .filter((r): r is ParsedReport => r !== null);
}

/**
 * The grounding gate for model-extracted numbers: true only when the
 * value's plain decimal rendering appears literally in the source text.
 * Deliberately conservative — "seventy-two" or a differently-formatted
 * "7.20" is dropped even though present. False negatives are an
 * inconvenience; a false positive is an invented number in a client deck.
 */
export function numberAppearsIn(source: string, value: unknown): boolean {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return false;
  const plain = String(n).replace(/\.0$/, '');
  return source.includes(plain);
}

/**
 * When the model's reply is cut off by the num_predict cap, JSON.parse fails
 * even though the scalar metrics are all present — they come first in the
 * requested shape and long issues/insights arrays are what overflow. Recover
 * the scalars from the truncated prefix so the report survives; the arrays
 * are dropped for that upload.
 */
export function salvageScalarFields(content: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const str = (k: string) => content.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`))?.[1];
  const num = (k: string) => {
    const m = content.match(new RegExp(`"${k}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    return m ? parseFloat(m[1]) : undefined;
  };
  for (const field of NUMERIC_FIELDS) {
    const v = num(field);
    if (v !== undefined) out[field] = v;
  }
  const quarter = str('quarter');
  if (quarter) out.quarter = quarter;
  const year = num('year');
  if (year !== undefined) out.year = year;
  for (const field of ['client', 'product', 'platform']) {
    const v = str(field);
    if (v) out[field] = v;
  }
  return out.susScore != null ? out : null;
}

// Models drift off the requested low|medium|high scale ("critical", "major");
// normalize instead of losing the issue.
export const SEVERITY_MAP: Record<string, string> = {
  critical: 'high', blocker: 'high', major: 'high', high: 'high',
  moderate: 'medium', medium: 'medium',
  minor: 'low', trivial: 'low', low: 'low',
};
