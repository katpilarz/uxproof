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
import {
  type ParsedReport,
  NUMERIC_FIELDS,
  SEVERITY_MAP,
  toReport,
  parseJsonReports,
  parseCsvReports,
  numberAppearsIn,
  salvageScalarFields,
  groundTasks,
  groundParticipantScores,
  groundQuotes,
  type ParsedTask,
  type ParsedParticipantScore,
  type ParsedQuote,
} from '@/lib/report-parsing';

const MAX_FILE_BYTES  = 5 * 1024 * 1024;
const MAX_STORED_TEXT = 30_000;
/**
 * How much of a document the model sees. 8000 cut the last page off an
 * eight-page report — which is exactly where per-participant scores live.
 */
const MAX_MODEL_CHARS = 14_000;

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
// (parsers + grounding gate live in lib/report-parsing.ts — pure and
//  unit-tested; this route owns only the I/O around them)

// ─── Model-based extraction for unstructured documents ───────────────────────
//
// PDFs / TXT / Markdown reports carry their metrics in prose. The local
// model CONVERTS that prose into the structured report shape — it never
// supplies values: every numeric field is validated to appear literally in
// the document text (numberAppearsIn, lib/report-parsing.ts), and any that
// don't are dropped. Missing quarter/year default to the current period
// (a filing label, not a metric).

function currentPeriod(): { quarter: string; year: number } {
  const now = new Date();
  return { quarter: `Q${Math.floor(now.getMonth() / 3) + 1}`, year: now.getFullYear() };
}

/**
 * Per-task results, per-participant SUS and verbatim quotes — the evidence
 * the deck's richest slides are built from.
 *
 * A SECOND, focused call rather than more fields on the main one: asked for
 * everything at once the model returns the scalars and quietly omits the
 * arrays; asked only for these it returns all of them. Splitting also means
 * a failure here costs only the detail, because the report itself is
 * already extracted and safe.
 *
 * Every value is validated against the document before it is kept.
 */
async function extractDetailViaModel(text: string): Promise<{
  tasks:             ParsedTask[];
  participantScores: ParsedParticipantScore[];
  quotes:            ParsedQuote[];
} | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   OLLAMA_MODEL,
        think:   false,
        stream:  false,
        format:  'json',
        options: { temperature: 0, num_predict: 3600 },
        messages: [
          {
            role: 'system',
            content:
              'You extract detailed UX research data from documents. Respond with ONE JSON object:\n' +
              '{"tasks": [{"code" ("T1".."T9"), "name", "successRate" number, "medianTime" ("m:ss"), "errors" number}] or [], ' +
              '"participantScores": [{"participant" ("P01".."P99"), "score" number 0-100}] or [], ' +
              '"quotes": [{"text", "attribution"}] or []}\n' +
              'STRICT RULES: copy ONLY what the document lists — never estimate, complete a series, or invent a row. ' +
              'Return [] for anything the document does not contain. ' +
              'A quote must be the participant\u2019s words copied character for character; never paraphrase or compose one.',
          },
          { role: 'user', content: `Document:\n\n${text.slice(0, MAX_MODEL_CHARS)}` },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw  = JSON.parse(data?.message?.content ?? 'null');
    if (!raw || typeof raw !== 'object') return null;

    // The raw document: each guard strips commas itself where a numeric
    // comparison needs it, and quotes must be matched against real prose.
    return {
      tasks:             groundTasks(raw.tasks, text),
      participantScores: groundParticipantScores(raw.participantScores, text),
      quotes:            groundQuotes(raw.quotes, text),
    };
  } catch (e) {
    console.warn('[api/files] detail extraction unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function extractReportViaModel(filename: string, text: string): Promise<ParsedReport | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   OLLAMA_MODEL,
        // qwen3.5 and other reasoning models emit a chain-of-thought that
        // consumes the token budget and leaves `content` empty — every
        // grounded answer here would silently fall back to the template.
        // Ollama ignores this on non-reasoning models, so it is safe to
        // send unconditionally.
        think:   false,
        stream:  false,
        format:  'json',
        // 1200 was tight enough that the prompt had to demand "under 20 words"
        // per field to fit, which truncated the issues and recommendations
        // extracted from real reports. The cap is a safety limit against a
        // runaway reply, not a style budget.
        options: { temperature: 0, num_predict: 2400 },
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
              'At most 3 issues and 3 insights, each grounded in the document. Keep each ' +
              'description, recommendation and summary to one or two clear sentences — enough to ' +
              'be useful to someone who has not read the document, without restating it.',
          },
          { role: 'user', content: `Document "${filename}":\n\n${text.slice(0, MAX_MODEL_CHARS)}` },
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
    // A body that isn't multipart form-data is a malformed request, not a
    // server fault — answer 400 rather than letting the throw become a 500.
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: 'Expected a multipart form upload.' },
        { status: 400 },
      );
    }
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
    // Detail extraction runs once for the document and attaches to the
    // period it describes. Only for prose uploads: a CSV of quarterly
    // metrics has no tasks, participants or quotes to find, so calling the
    // model for it would cost a minute to learn nothing.
    const detail = extractedByModel && parsed.length === 1
      ? await extractDetailViaModel(text)
      : null;
    if (detail) {
      console.log(
        '[api/files] detail extracted —',
        `${detail.tasks.length} tasks,`,
        `${detail.participantScores.length} participant scores,`,
        `${detail.quotes.length} quotes`,
      );
    }

    for (const report of parsed) {
      const withDetail = {
        ...(report as unknown as Record<string, unknown>),
        ...(detail?.tasks.length             ? { tasks:             detail.tasks }             : {}),
        ...(detail?.participantScores.length ? { participantScores: detail.participantScores } : {}),
        ...(detail?.quotes.length            ? { quotes:            detail.quotes }            : {}),
      };
      await upsertUserReport(user.id, withDetail as { quarter: string; year: number } & Record<string, unknown>);
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
