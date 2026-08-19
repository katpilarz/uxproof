// scripts/reextract-files.mjs
//
// Backfill: re-runs the guardrailed model extraction for stored user files
// that carry no research data (reportsCreated is empty). Uploads made while
// extraction was broken (model reply truncated by the token cap) have their
// full text stored on the userFile doc, so the data can be recovered without
// re-uploading.
//
// Mirrors app/api/files/route.ts exactly: the model only CONVERTS — every
// numeric field must appear literally in the document text or is dropped,
// and a report without a grounded susScore is skipped entirely. Only the
// filing period may default to the current quarter.
//
// Run from next/:  npm run reextract:files

import { readFileSync } from 'node:fs';
import { createClient } from '@sanity/client';

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

const OLLAMA_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen2.5:14b';

const NUMERIC_FIELDS = [
  'susScore', 'susChange', 'taskSuccessRate', 'npsScore',
  'participants', 'errorRate', 'conversionRate',
];

const SEVERITY_MAP = {
  critical: 'high', blocker: 'high', major: 'high', high: 'high',
  moderate: 'medium', medium: 'medium',
  minor: 'low', trivial: 'low', low: 'low',
};

function numberAppearsIn(source, value) {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return false;
  return source.includes(String(n).replace(/\.0$/, ''));
}

function salvageScalarFields(content) {
  const out = {};
  const str = (k) => content.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`))?.[1];
  const num = (k) => {
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

function currentPeriod() {
  const now = new Date();
  return { quarter: `Q${Math.floor(now.getMonth() / 3) + 1}`, year: now.getFullYear() };
}

const keyed = (arr, required) =>
  (Array.isArray(arr) ? arr : [])
    .filter(x => !!x && typeof x === 'object' && required.every(f => typeof x[f] === 'string'))
    .map((x, i) => ({ _key: `k${i}`, ...x }));

async function extractReportViaModel(filename, text) {
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
  if (!res.ok) throw new Error(`Ollama ${res.status}`);

  const data    = await res.json();
  const content = data?.message?.content ?? 'null';
  let raw;
  try { raw = JSON.parse(content); }
  catch {
    raw = salvageScalarFields(content);
    if (raw) console.log('    (reply truncated — salvaged scalar metrics only)');
  }
  if (!raw || typeof raw !== 'object') return null;

  // Grounding guardrail — identical to the upload route.
  const source = text.replace(/,/g, '');
  for (const field of NUMERIC_FIELDS) {
    if (raw[field] != null && !numberAppearsIn(source, raw[field])) {
      console.log(`    guardrail dropped ${field}: ${raw[field]}`);
      raw[field] = null;
    }
    if (raw[field] == null) delete raw[field];
  }
  if (raw.susScore == null) return null;

  const fallback = currentPeriod();
  const quarter = /^Q[1-4]$/i.test(String(raw.quarter ?? '')) ? String(raw.quarter).toUpperCase() : fallback.quarter;
  const yr = parseInt(String(raw.year ?? ''), 10);
  const year = yr >= 2000 && yr <= 2100 ? yr : fallback.year;

  const report = { quarter, year, susScore: parseFloat(String(raw.susScore)) };
  for (const field of NUMERIC_FIELDS) {
    if (field === 'susScore') continue;
    const v = parseFloat(String(raw[field] ?? ''));
    if (Number.isFinite(v)) report[field] = v;
  }
  for (const field of ['client', 'product', 'platform']) {
    if (typeof raw[field] === 'string' && raw[field]) report[field] = raw[field];
  }
  report.issues = keyed(raw.issues, ['title', 'description']).map(issue => ({
    ...issue,
    ...(typeof issue.severity === 'string'
      ? { severity: SEVERITY_MAP[issue.severity.toLowerCase()] ?? 'medium' }
      : {}),
  }));
  report.insights = keyed(raw.insights, ['title', 'summary']);
  return report;
}

const files = await client.fetch(
  `*[_type == "userFile" && defined(user) && defined(textContent)
     && count(coalesce(reportsCreated, [])) == 0]{
    _id, filename, textContent, "userId": user._ref
  } | order(uploadedAt asc)`,
);

console.log(`Dataset: ${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'}`);
console.log(`Files without extracted data: ${files.length}\n`);

const cache = new Map(); // identical text → same extraction, one model call

for (const file of files) {
  console.log(`• ${file.filename} (${file._id})`);
  try {
    let report;
    if (cache.has(file.textContent)) {
      report = cache.get(file.textContent);
      console.log('    (same content as an earlier file — reusing extraction)');
    } else {
      report = await extractReportViaModel(file.filename, file.textContent);
      cache.set(file.textContent, report);
    }
    if (!report) {
      console.log('    no grounded research data found — stays reference-only');
      continue;
    }

    const reportId = `report_${file.userId.replace(/^user_/, '')}_${report.quarter.toLowerCase()}_${report.year}`;
    await client.createOrReplace({
      _type:    'report',
      _id:      reportId,
      reportId,
      user:     { _type: 'reference', _ref: file.userId },
      ...report,
      generatedDate: new Date().toISOString(),
    });
    await client.patch(file._id).set({ reportsCreated: [`${report.quarter} ${report.year}`] }).commit();
    console.log(`    ✓ ${report.quarter} ${report.year} — SUS ${report.susScore} → ${reportId}`);
  } catch (e) {
    console.log(`    ✗ failed: ${e.message}`);
  }
}

console.log('\nDone.');
