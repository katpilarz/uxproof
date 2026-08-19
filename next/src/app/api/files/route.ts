/**
 * app/api/files/route.ts
 *
 * POST multipart/form-data { file, sessionId?, isNewSession? }
 *   Uploads a research file/report into the signed-in user's workspace:
 *     1. extracts plain text (txt / md / csv / json)
 *     2. when the content parses as structured UX research data
 *        (quarter + year + susScore), upserts user-owned `report`
 *        documents — this is what the analysis & deck machinery reads
 *     3. writes a summary — deterministic first, optionally rewritten by
 *        the local Ollama model with a numeric guardrail (every number in
 *        the rewrite must exist in the source text; otherwise discarded)
 *     4. stores a `userFile` document (the user's file directory)
 *     5. appends the upload + summary to the chat session so the
 *        conversation shows what happened
 *
 * GET — lists the user's uploaded files.
 *
 * Engineering rules upheld: numbers are parsed from the uploaded file,
 * never generated; Ollama is an enhancement with a deterministic fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createUserFile,
  getUserFiles,
  upsertUserReport,
  createChatSession,
  appendMessageToSession,
} from '@/lib/sanity';

const MAX_FILE_BYTES  = 5 * 1024 * 1024;
const MAX_STORED_TEXT = 30_000;

const OLLAMA_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen2.5:14b';

// ─── Text extraction ──────────────────────────────────────────────────────────

const SUPPORTED = ['txt', 'md', 'markdown', 'csv', 'json'];

function extensionOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

// ─── Structured report parsing ────────────────────────────────────────────────
//
// A "structured report" is any JSON object / array or CSV row carrying at
// least quarter + year + susScore. Everything else on the row is carried
// through when it matches the report schema's fields.

interface ParsedReport {
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

const NUMERIC_FIELDS = [
  'susScore', 'susChange', 'taskSuccessRate', 'npsScore',
  'participants', 'errorRate', 'conversionRate',
] as const;

function normKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, '');
}

// canonical field ← accepted normalized spellings
const FIELD_ALIASES: Record<string, string[]> = {
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

function toReport(raw: Record<string, unknown>): ParsedReport | null {
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

function parseJsonReports(text: string): ParsedReport[] {
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
function splitCsvLine(line: string): string[] {
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

function parseCsvReports(text: string): ParsedReport[] {
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

// ─── Summaries ────────────────────────────────────────────────────────────────

const sign = (n: number) => (n >= 0 ? '+' : '');

function deterministicSummary(filename: string, text: string, reports: ParsedReport[]): string {
  if (reports.length) {
    const lines = reports
      .sort((a, b) => (a.year - b.year) || a.quarter.localeCompare(b.quarter))
      .map(r => {
        const bits = [`SUS **${r.susScore}**`];
        if (r.taskSuccessRate !== undefined) bits.push(`task success **${r.taskSuccessRate}%**`);
        if (r.npsScore        !== undefined) bits.push(`NPS **${sign(r.npsScore)}${r.npsScore}**`);
        if (r.participants    !== undefined) bits.push(`**${r.participants}** participants`);
        return `• **${r.quarter} ${r.year}** — ${bits.join(', ')}`;
      });
    const first = reports[0];
    return `Parsed **${reports.length} research period${reports.length === 1 ? '' : 's'}** from **${filename}**:\n\n${lines.join('\n')}\n\nThis data is now available to your analyses and presentations — try _"Analyse ${first.quarter} ${first.year}"_ or _"Generate ${first.quarter} ${first.year} presentation"_.`;
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const firstSentences = text.replace(/\s+/g, ' ').slice(0, 300).trim();
  return `Stored **${filename}** (${words.toLocaleString()} words) in your files.\n\n> ${firstSentences}${text.length > 300 ? '…' : ''}\n\nNo structured quarterly metrics were detected, so this file is kept as reference context. To feed analyses and decks, upload a CSV or JSON containing \`quarter\`, \`year\` and \`susScore\` columns.`;
}

/**
 * Optional Ollama rewrite of the fallback summary. Numeric guardrail: every
 * substantial number in the reply must exist in the source text, otherwise
 * the rewrite is discarded. Returns null on any failure.
 */
async function aiSummary(filename: string, text: string): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   OLLAMA_MODEL,
        stream:  false,
        options: { temperature: 0.2, num_predict: 300 },
        messages: [
          {
            role: 'system',
            content:
              'You summarize UX research documents for a research assistant. ' +
              'Summarize the document in GitHub-flavoured markdown, under 100 words. ' +
              'Use ONLY facts and numbers that literally appear in the document — never invent or round numbers. ' +
              'Lead with what the document is, then the 2-3 most important findings or figures. No greetings.',
          },
          { role: 'user', content: `Document "${filename}":\n\n${text.slice(0, 6000)}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const reply = (data?.message?.content ?? '').trim();
    if (reply.length < 20) return null;

    const source = text.replace(/,/g, '');
    for (const num of reply.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []) {
      const value = parseFloat(num);
      if (value <= 12 && Number.isInteger(value)) continue;                    // small counts
      if (value >= 1900 && value <= 2100 && Number.isInteger(value)) continue; // years
      if (!source.includes(num)) {
        console.warn('[api/files] summary guardrail: number not in source:', num);
        return null;
      }
    }
    return reply;
  } catch {
    return null;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ files: [], error: 'Not signed in' }, { status: 401 });
  }
  try {
    const files = await getUserFiles(user.id);
    return NextResponse.json({ files: files || [] });
  } catch (e) {
    console.error('[api/files] GET error:', e);
    return NextResponse.json({ files: [], error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const form         = await request.formData();
    const file         = form.get('file');
    const sessionId    = String(form.get('sessionId') ?? '').trim() || undefined;
    const isNewSession = String(form.get('isNewSession') ?? '') === 'true';

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Files must be 5MB or smaller.' }, { status: 400 });
    }
    const ext = extensionOf(file.name);
    if (!SUPPORTED.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Supported: ${SUPPORTED.map(e => '.' + e).join(', ')}.` },
        { status: 400 },
      );
    }

    const text = (await file.text()).trim();
    if (!text) {
      return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
    }

    // 1. Structured research data → user-owned report documents
    const parsed =
      ext === 'json' ? parseJsonReports(text)
      : ext === 'csv' ? parseCsvReports(text)
      : [];
    for (const report of parsed) {
      await upsertUserReport(user.id, report as unknown as { quarter: string; year: number } & Record<string, unknown>);
    }
    const reportsCreated = parsed.map(r => `${r.quarter} ${r.year}`);

    // 2. Summary — deterministic for structured data (numbers straight from
    //    the parse); for free-text files try the AI rewrite first.
    let summary = deterministicSummary(file.name, text, parsed);
    if (!parsed.length) {
      const enhanced = await aiSummary(file.name, text);
      if (enhanced) {
        summary = `${enhanced}\n\n_Stored **${file.name}** in your files. To feed analyses and decks, upload a CSV or JSON with \`quarter\`, \`year\` and \`susScore\` columns._`;
      }
    }

    // 3. The user's file directory entry
    const doc = await createUserFile(user.id, {
      filename:       file.name,
      mimeType:       file.type || `text/${ext}`,
      size:           file.size,
      summary,
      textContent:    text.slice(0, MAX_STORED_TEXT),
      reportsCreated,
      sessionId,
    });

    // 4. Reflect the upload in the conversation history
    const timestamp = Date.now();
    if (sessionId) {
      try {
        if (isNewSession) {
          await createChatSession(sessionId, { quarter: 'unknown' }, user.id);
        }
        await appendMessageToSession(sessionId, {
          messageId: `msg_${timestamp}_user`,
          role:      'user',
          content:   `Uploaded ${file.name}`,
        }, user.id);
        await appendMessageToSession(sessionId, {
          messageId: `msg_${timestamp}_assistant`,
          role:      'assistant',
          content:   summary,
        }, user.id);
      } catch (e) {
        console.warn('[api/files] session persistence failed:', e);
      }
    }

    return NextResponse.json({
      file: {
        _id:      doc._id,
        filename: file.name,
        size:     file.size,
      },
      reportsCreated,
      assistantMessage: {
        id:        `${timestamp}`,
        role:      'assistant',
        content:   summary,
        timestamp: new Date(),
      },
    });
  } catch (e) {
    console.error('[api/files] POST error:', e);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
