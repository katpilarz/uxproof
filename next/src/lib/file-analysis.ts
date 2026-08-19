// lib/file-analysis.ts
//
// Shared document-summary helpers used by /api/files (at upload time) and
// /api/chat (the "Summarize the file …" active prompt from /files).
//
// Grounding rules: the AI summary may only restate facts from the document
// (numeric guardrail — every substantial number must literally appear in
// the source text, else the summary is discarded), and when the text
// carries [page N] markers (PDF extraction) it cites the page each fact
// comes from, so users can verify nothing is hallucinated.

const OLLAMA_URL   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen2.5:14b';

export const sign = (n: number) => (n >= 0 ? '+' : '');

/** Deterministic fallback when Ollama is unavailable. */
export function fallbackTextSummary(filename: string, text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  const firstSentences = text
    .replace(/\[page \d+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 300)
    .trim();
  return `Stored **${filename}** (${words.toLocaleString()} words) in your files.\n\n> ${firstSentences}${text.length > 300 ? '…' : ''}`;
}

/**
 * Detailed, grounded AI summary of a document. Cites source pages when the
 * text carries [page N] markers. Returns null on any failure (Ollama down,
 * timeout, guardrail) — callers fall back to fallbackTextSummary.
 */
export async function aiDocumentSummary(filename: string, text: string): Promise<string | null> {
  const hasPageMarkers = /\[page \d+\]/i.test(text);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   OLLAMA_MODEL,
        stream:  false,
        options: { temperature: 0.2, num_predict: 600 },
        messages: [
          {
            role: 'system',
            content:
              'You summarize UX research documents for a research assistant. ' +
              'Write a DETAILED summary in GitHub-flavoured markdown, under 220 words, structured as:\n' +
              '1. One line: what the document is (study, product, round/period).\n' +
              '2. **Metrics** — every key metric in the document with its exact value (SUS, task success, NPS, trust, participants, error rate, targets…), as a bullet list.\n' +
              '3. **Key issues / findings** — each with its supporting numbers where the document gives them.\n' +
              '4. **Recommendations** — the document\'s own recommendations.\n' +
              'Use ONLY facts and numbers that literally appear in the document — never invent, estimate, or round numbers. Omit a section only if the document has nothing for it. No greetings.' +
              (hasPageMarkers
                ? '\nThe document text contains [page N] source markers. After EVERY metric, finding, and recommendation, cite the page it appears on in parentheses, e.g. "(p. 2)". Use only the page whose marked section actually contains that fact.'
                : ''),
          },
          { role: 'user', content: `Document "${filename}":\n\n${text.slice(0, 8000)}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Models sometimes wrap the whole summary in a ``` fence — unwrap it.
    const reply = (data?.message?.content ?? '')
      .trim()
      .replace(/^```[a-z]*\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    if (reply.length < 20) return null;

    // Guardrail: every substantial number in the reply must appear in the
    // source text. Page citations pass because their [page N] markers are
    // part of the text being checked against.
    const source = text.replace(/,/g, '');
    for (const num of reply.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []) {
      const value = parseFloat(num);
      if (value <= 12 && Number.isInteger(value)) continue;                    // small counts
      if (value >= 1900 && value <= 2100 && Number.isInteger(value)) continue; // years
      if (!source.includes(num)) {
        console.warn('[file-analysis] summary guardrail: number not in source:', num);
        return null;
      }
    }
    return reply;
  } catch {
    return null;
  }
}
