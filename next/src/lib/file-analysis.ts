// lib/file-analysis.ts
//
// Shared document-summary helpers used by /api/files (at upload time) and
// /api/chat (the "Summarize the file …" active prompt from /files).
//
// Grounding rules: the AI summary may only restate facts from the document
// (numeric guardrail — every substantial number must literally appear in
// the source text, else the summary is discarded).
//
// Citations are not taken on trust. The model attaches a verbatim quote to
// each fact; lib/source-index.ts looks that quote up in the document and
// writes the citation from where it was actually found (p. 2 ¶3). A quote
// the document does not contain loses its citation instead of gaining a
// fabricated one, so every "(p. N ¶M)" a user sees points at real text
// they can go and read.

import { applyVerifiedCitations } from './source-index';

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
 * The summary guardrail, pure and unit-tested: every substantial number in
 * the reply must literally appear in the source text. Small integer counts
 * (≤ 12) and year-like integers (1900–2100) are exempt — they are structure,
 * not metrics. Returns false when any other number can't be traced.
 */
export function summaryNumbersGrounded(reply: string, text: string): boolean {
  const source = text.replace(/,/g, '');
  for (const num of reply.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []) {
    const value = parseFloat(num);
    if (value <= 12 && Number.isInteger(value)) continue;                    // small counts
    if (value >= 1900 && value <= 2100 && Number.isInteger(value)) continue; // years
    if (!source.includes(num)) {
      console.warn('[file-analysis] summary guardrail: number not in source:', num);
      return false;
    }
  }
  return true;
}

/**
 * Detailed, grounded AI summary of a document. Cites source pages when the
 * text carries [page N] markers. Returns null on any failure (Ollama down,
 * timeout, guardrail) — callers fall back to fallbackTextSummary.
 */
export async function aiDocumentSummary(filename: string, text: string): Promise<string | null> {
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
              'Use ONLY facts and numbers that literally appear in the document — never invent, estimate, or round numbers. Omit a section only if the document has nothing for it. No greetings.\n' +
              'CITATIONS: after EVERY metric, finding and recommendation, add the sentence or phrase from the document that supports it, copied WORD FOR WORD, wrapped as ⟦q: copied words⟧. ' +
              'Copy exactly — do not paraphrase, shorten or fix the wording inside the marker; it is checked against the document and dropped if it does not match. ' +
              'Keep each quote between 6 and 20 words. Do not write page numbers yourself — they are filled in automatically from the quote.',
          },
          { role: 'user', content: `Document "${filename}":\n\n${text.slice(0, 8000)}` },
        ],
      }),
      // Larger models are slower: a 27B model takes ~26s on an 8-page PDF,
      // which used to trip the old 30s budget and silently drop every AI
      // summary to the deterministic fallback.
      signal: AbortSignal.timeout(90_000),
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
    if (!summaryNumbersGrounded(reply, text)) return null;

    // Turn each quote marker into a citation pointing at where that quote
    // actually lives. Quotes the document doesn't contain lose their
    // citation rather than getting a made-up one.
    const cited = applyVerifiedCitations(reply, text);

    // The model was asked for quotes and produced none that check out —
    // it is not reading the document, so the summary is not trustworthy
    // enough to show. Fall back to the deterministic one.
    if (cited.claimed > 0 && cited.verified === 0) {
      console.warn('[file-analysis] no citation verified out of', cited.claimed, '— discarding summary');
      return null;
    }
    return cited.text;
  } catch {
    return null;
  }
}
