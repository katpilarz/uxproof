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
import { extractText, getDocumentProxy } from 'unpdf';
import { aiDocumentSummary, fallbackTextSummary, sign } from '@/lib/file-analysis';
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

const SUPPORTED = ['txt', 'md', 'markdown', 'csv', 'json', 'pdf'];

function extensionOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/**
 * PDF → plain text via unpdf (pdf.js under the hood, pure JS, local).
 * Each page is prefixed with a [page N] marker so summaries can cite the
 * page every fact comes from — the trust anchor against hallucination.
 */
async function extractPdfText(file: File): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const pageTexts = (pages ?? []).map(p => (p ?? '').trim());
  if (!pageTexts.some(Boolean)) return '';
  return pageTexts
    .map((p, i) => `[page ${i + 1}]\n${p}`)
    .join('\n\n')
    .trim();
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

// ─── Model-based extraction for unstructured documents ───────────────────────
//
// PDFs / TXT / Markdown reports carry their metrics in prose. The local
// model CONVERTS that prose into the structured report shape — it never
// supplies values: every numeric field is validated to appear literally in
// the document text, and any that don't are dropped. Missing quarter/year
// default to the current period (a filing label, not a metric).

function numberAppearsIn(source: string, value: unknown): boolean {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return false;
  const plain = String(n).replace(/\.0$/, '');
  return source.includes(plain);
}

function currentPeriod(): { quarter: string; year: number } {
  const now = new Date();
  return { quarter: `Q${Math.floor(now.getMonth() / 3) + 1}`, year: now.getFullYear() };
}

/**
 * When the model's reply is cut off by the num_predict cap, JSON.parse fails
 * even though the scalar metrics are all present — they come first in the
 * requested shape and long issues/insights arrays are what overflow. Recover
 * the scalars from the truncated prefix so the report survives; the arrays
 * are dropped for that upload.
 */
function salvageScalarFields(content: string): Record<string, unknown> | null {
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
const SEVERITY_MAP: Record<string, string> = {
  critical: 'high', blocker: 'high', major: 'high', high: 'high',
  moderate: 'medium', medium: 'medium',
  minor: 'low', trivial: 'low', low: 'low',
};

async function extractReportViaModel(filename: string, text: string): Promise<ParsedReport | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   OLLAMA_MODEL,
        stream:  false,
        format:  'json',
        options: { temperature: 0, num_predict: 1200 },
        messages: [
          {
            role: 'system',
            content:
              'You extract structured UX research data from documents. Respond with ONE JSON object:\n' +
              '{"quarter": "Q1".."Q4" or null, "year": number or null, "susScore": number or null, ' +
              '"susChange": number or null, "taskSuccessRate": number or null, "npsScore": number or null, ' +
              '"participants": number or null, "errorRate": number or null, "conversionRate": number or null, ' +
              '"client": string or null, "product": string or null, ' +
              '"issues": [{"title", "severity" ("low"|"medium"|"high"), "description", "recommendation"}] or [], ' +
              '"insights": [{"category", "title", "summary"}] or []}\n' +
              'STRICT RULES: use ONLY values that literally appear in the document — never estimate, convert, or invent a number. ' +
              'A metric not present in the document is null. quarter/year only if the document names them. ' +
              'At most 3 issues and 3 insights, each grounded in the document. BE TERSE: every ' +
              'description, recommendation and summary must stay under 20 words — the reply must fit the token budget.',
          },
          { role: 'user', content: `Document "${filename}":\n\n${text.slice(0, 8000)}` },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;

    const data    = await res.json();
    const content = data?.message?.content ?? 'null';
    let raw: Record<string, unknown> | null;
    try {
      raw = JSON.parse(content);
    } catch {
      raw = salvageScalarFields(content);
      if (raw) console.warn('[api/files] model reply truncated — salvaged scalar metrics only');
    }
    if (!raw || typeof raw !== 'object') return null;

    if (Array.isArray(raw.issues)) {
      for (const issue of raw.issues) {
        if (issue && typeof issue === 'object' && typeof (issue as Record<string, unknown>).severity === 'string') {
          const sev = ((issue as Record<string, string>).severity || '').toLowerCase();
          (issue as Record<string, string>).severity = SEVERITY_MAP[sev] ?? 'medium';
        }
      }
    }

    // Grounding guardrail: keep only numeric fields whose value literally
    // appears in the source text. susScore is required for a report.
    const source = text.replace(/,/g, '');
    for (const field of NUMERIC_FIELDS) {
      if (raw[field] != null && !numberAppearsIn(source, raw[field])) {
        console.warn(`[api/files] extraction guardrail dropped ${field}:`, raw[field]);
        raw[field] = null;
      }
      if (raw[field] == null) delete raw[field];
    }
    if (raw.susScore == null) return null;

    // Period is a filing label — fall back to the current quarter when the
    // document doesn't name one.
    const fallback = currentPeriod();
    if (!/^Q[1-4]$/i.test(String(raw.quarter ?? ''))) raw.quarter = fallback.quarter;
    const yr = parseInt(String(raw.year ?? ''), 10);
    if (!(yr >= 2000 && yr <= 2100)) raw.year = fallback.year;

    return toReport(raw);
  } catch (e) {
    console.warn('[api/files] model extraction unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Summaries ────────────────────────────────────────────────────────────────
// (the AI document summary + text fallback live in lib/file-analysis.ts,
//  shared with the chat route's "Summarize the file …" prompt)

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

  return fallbackTextSummary(filename, text);
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

    // PDFs are binary — extract text via unpdf; everything else is read
    // directly as UTF-8.
    let text: string;
    if (ext === 'pdf') {
      try {
        text = await extractPdfText(file);
      } catch (e) {
        console.warn('[api/files] PDF extraction failed:', e);
        return NextResponse.json(
          { error: 'Could not read that PDF. It may be corrupted or password-protected.' },
          { status: 400 },
        );
      }
      if (!text) {
        return NextResponse.json(
          { error: 'No extractable text found in the PDF — it may be a scanned document (images only).' },
          { status: 400 },
        );
      }
    } else {
      text = (await file.text()).trim();
      if (!text) {
        return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
      }
    }

    // 1. Structured research data → user-owned report documents.
    //    CSV/JSON parse deterministically; for everything else (and for
    //    CSV/JSON that didn't match the expected columns) the local model
    //    CONVERTS the document into the report shape automatically — the
    //    user never has to re-upload anything. Guardrails inside
    //    extractReportViaModel keep every number literal-to-the-document.
    let parsed =
      ext === 'json' ? parseJsonReports(text)
      : ext === 'csv' ? parseCsvReports(text)
      : [];
    let extractedByModel = false;
    if (!parsed.length) {
      const modelReport = await extractReportViaModel(file.name, text);
      if (modelReport) {
        parsed = [modelReport];
        extractedByModel = true;
      }
    }
    for (const report of parsed) {
      await upsertUserReport(user.id, report as unknown as { quarter: string; year: number } & Record<string, unknown>);
    }
    const reportsCreated = parsed.map(r => `${r.quarter} ${r.year}`);

    // 2. Summary — detailed AI summary for prose documents (falls back to
    //    the deterministic one); deterministic period listing for CSV/JSON.
    //    When the model extracted data, say so explicitly with the values.
    let summary: string;
    if (parsed.length && !extractedByModel) {
      summary = deterministicSummary(file.name, text, parsed);
    } else {
      summary = (await aiDocumentSummary(file.name, text)) ?? deterministicSummary(file.name, text, []);
      if (extractedByModel) {
        const r = parsed[0];
        const bits = [`SUS **${r.susScore}**`];
        if (r.taskSuccessRate !== undefined) bits.push(`task success **${r.taskSuccessRate}%**`);
        if (r.npsScore        !== undefined) bits.push(`NPS **${sign(r.npsScore)}${r.npsScore}**`);
        if (r.participants    !== undefined) bits.push(`**${r.participants}** participants`);
        if (r.errorRate       !== undefined) bits.push(`error rate **${r.errorRate}%**`);
        summary += `\n\n---\n\n📊 **Research data extracted automatically** and filed under **${r.quarter} ${r.year}**: ${bits.join(', ')}. It's now available to your analyses and presentations.`;
      }
    }

    // 3. The user's file directory entry
    const doc = await createUserFile(user.id, {
      filename:       file.name,
      mimeType:       file.type || (ext === 'pdf' ? 'application/pdf' : `text/${ext}`),
      size:           file.size,
      summary,
      textContent:    text.slice(0, MAX_STORED_TEXT),
      reportsCreated,
      sessionId,
    });

    // 4. Automatic follow-up — the assistant's second message. With data
    //    available it carries presentation-card metadata, so the chat
    //    renders the deck card with its "Generate & download .pptx"
    //    button (no auto-start — generation runs when the user clicks).
    //    A typed "yes"/"generate a presentation" reply also still works.
    let followUp: string;
    let followUpMeta: {
      showPresentation?:  boolean;
      presentationScope?: 'quarter' | 'year';
      quarter?:           string;
      year?:              number;
      contextQuarter?:    string;
    } = {};
    if (parsed.length) {
      const latest = [...parsed].sort((a, b) => (a.year - b.year) || a.quarter.localeCompare(b.quarter)).pop()!;
      followUp =
        `Ready when you are — click **Generate & download .pptx** below to generate a presentation for **${latest.quarter} ${latest.year}**` +
        (parsed.length > 1 ? `, or name another uploaded period in chat.` : `.`);
      followUpMeta = {
        showPresentation:  true,
        presentationScope: 'quarter',
        quarter:           latest.quarter,
        year:              latest.year,
        contextQuarter:    `${latest.quarter} ${latest.year}`,
      };
    } else {
      followUp =
        `I couldn't detect quarterly research metrics in this document, so it's stored as reference context — ask me anything about **${file.name}**.`;
    }

    // 5. Reflect the upload + both assistant turns in the conversation
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
        await appendMessageToSession(sessionId, {
          messageId: `msg_${timestamp}_followup`,
          role:      'assistant',
          content:   followUp,
          ...followUpMeta,
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
      followUpMessage: {
        id:        `${timestamp}_followup`,
        role:      'assistant',
        content:   followUp,
        timestamp: new Date(),
        ...followUpMeta,
      },
    });
  } catch (e) {
    console.error('[api/files] POST error:', e);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
