// lib/source-index.ts
//
// Maps a claim back to the exact place in the uploaded document it came
// from — the trust anchor for AI summaries.
//
// The model is asked to attach a short verbatim quote to each fact. We do
// NOT trust the location it reports: we take the quote and LOOK IT UP in
// the document. The citation is derived from where the quote actually is,
// so a citation can only ever point at real text. A quote that cannot be
// found anywhere is a fabrication, and its citation is dropped.
//
// Paragraph numbers are derived here rather than written during extraction,
// so documents uploaded before citations existed get them too — the
// [page N] markers that extraction already writes are enough.

export interface SourceSpan {
  /** 1-based page, or null for formats without pages (txt, md, csv). */
  page:  number | null;
  /** 1-based paragraph, counted within the page. */
  para:  number;
  text:  string;
}

/** Lowercase, collapse whitespace, normalise the punctuation that differs
 *  between a PDF's text layer and what a model types back. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")     // curly → straight apostrophe
    .replace(/[“”]/g, '"')           // curly → straight quote
    .replace(/[‐-―−]/g, '-')    // dashes → hyphen
    .replace(/ /g, ' ')                   // nbsp → space
    .replace(/\s+/g, ' ')
    .trim();
}

const PAGE_MARKER = /\[page\s+(\d+)\]/gi;

/**
 * Split a block of text into paragraphs.
 *
 * Plain text (txt, md) separates paragraphs with blank lines, so that is
 * used when present. A PDF's text layer has none: it emits one line per
 * rendered line, wrapped at the column width, and a paragraph is a run of
 * full-width lines ending in a short one. Splitting such text on blank
 * lines yields a single paragraph per page, which makes a "¶" citation
 * meaningless — so wrapped lines are re-joined here instead.
 */
export function splitParagraphs(body: string): string[] {
  if (!body.trim()) return [];

  // Clean case — the document tells us where paragraphs end.
  if (/\n\s*\n/.test(body.trim())) {
    return body
      .split(/\n\s*\n/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return lines.map(l => l.replace(/\s+/g, ' '));

  // The wrap column, taken as the longest line — body text runs right up to
  // it, headings and paragraph-final lines fall short of it.
  const wrapWidth = Math.max(...lines.map(l => l.length));

  // Only prose actually wraps. A block whose longest line is short is a
  // list, a heading stack or a table of metrics: nothing is continued
  // there, so every line stands alone. Without this, a run of same-length
  // short lines all look "full width" and collapse into one paragraph.
  const MIN_WRAP_WIDTH = 60;
  if (wrapWidth < MIN_WRAP_WIDTH) {
    return lines.map(l => l.replace(/\s+/g, ' '));
  }

  const FULL_LINE = wrapWidth * 0.85;

  const paras: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    current.push(line);
    const endsSentence = /[.!?]["\u201d\u2019)]?$/.test(line);
    const isShort      = line.length < FULL_LINE;
    // A line that stops short of the wrap column is the end of its
    // paragraph; a full-width line is mid-wrap and continues.
    if (isShort || endsSentence) {
      paras.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
    }
  }
  if (current.length) paras.push(current.join(' ').replace(/\s+/g, ' ').trim());

  return paras.filter(Boolean);
}


/**
 * Split document text into addressable paragraphs. Handles both the
 * [page N] marked form produced by PDF extraction and plain text.
 */
export function buildSourceIndex(text: string): SourceSpan[] {
  if (!text?.trim()) return [];

  const spans: SourceSpan[] = [];

  const pushParagraphs = (body: string, page: number | null) => {
    splitParagraphs(body).forEach((p, i) => spans.push({ page, para: i + 1, text: p }));
  };

  PAGE_MARKER.lastIndex = 0;
  const markers = [...text.matchAll(PAGE_MARKER)];

  if (!markers.length) {
    pushParagraphs(text, null);
    return spans;
  }

  markers.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end   = i + 1 < markers.length ? markers[i + 1].index! : text.length;
    pushParagraphs(text.slice(start, end), parseInt(m[1], 10));
  });

  // Anything before the first page marker still belongs to the document.
  const preamble = text.slice(0, markers[0].index!);
  if (preamble.trim()) pushParagraphs(preamble, markers[0] ? parseInt(markers[0][1], 10) : null);

  return spans;
}

/**
 * Where does this quote actually live? Returns the span containing it, or
 * null when the quote appears nowhere in the document.
 *
 * Falls back to a looser match on the quote's first clause, because models
 * routinely paraphrase the tail of a sentence while quoting its opening
 * faithfully — the opening is enough to pin the location.
 */
export function locateQuote(quote: string, spans: SourceSpan[]): SourceSpan | null {
  const needle = normalizeForMatch(quote);
  if (needle.length < 12) return null;   // too short to identify a location

  for (const span of spans) {
    if (normalizeForMatch(span.text).includes(needle)) return span;
  }

  // Looser: the first substantial clause of the quote.
  const head = needle.split(/[,;:]/)[0].trim();
  if (head.length >= 20) {
    for (const span of spans) {
      if (normalizeForMatch(span.text).includes(head)) return span;
    }
  }
  return null;
}

/** "(p. 2 ¶3)" for paged documents, "(¶3)" for those without pages. */
export function formatCitation(span: SourceSpan): string {
  return span.page === null ? `(¶${span.para})` : `(p. ${span.page} ¶${span.para})`;
}

// ─── Citation verification ────────────────────────────────────────────────────

/** Result of grounding a summary's citations against the source document. */
export interface CitedSummary {
  /** The summary with every surviving citation pointing at real text. */
  text:      string;
  /** How many quote markers the model emitted. */
  claimed:   number;
  /** How many were found in the document and turned into citations. */
  verified:  number;
}

// The model wraps each supporting quote in these markers. They are a
// delimiter, not output — every one is replaced by a verified citation or
// removed. Characters chosen so a model will not emit them by accident.
//
// The `q:` prefix is optional because models routinely drop it and emit a
// bare ⟦quote⟧. The prefix was never the point — the brackets delimit, and
// the quote inside is verified against the document either way.
const QUOTE_MARKER = /\u27e6\s*(?:q\s*:)?\s*([\s\S]*?)\u27e7/g;

/**
 * Replace each ⟦q: …⟧ marker with a citation derived from where that quote
 * actually appears in the document.
 *
 * A quote that cannot be located is a fabrication: its marker is removed so
 * the claim survives uncited rather than carrying a citation that points
 * nowhere. Callers decide what to do when nothing verifies — see
 * aiDocumentSummary, which discards the summary entirely in that case.
 */
export function applyVerifiedCitations(reply: string, sourceText: string): CitedSummary {
  const spans = buildSourceIndex(sourceText);
  let claimed  = 0;
  let verified = 0;

  QUOTE_MARKER.lastIndex = 0;
  const text = reply.replace(QUOTE_MARKER, (_all, quote: string) => {
    claimed += 1;
    const span = locateQuote(String(quote), spans);
    if (!span) {
      console.warn('[file-analysis] citation dropped, quote not in source:', String(quote).slice(0, 60));
      return '';
    }
    verified += 1;
    return ` ${formatCitation(span)}`;
  });

  return {
    text: text.replace(/[ \t]+/g, ' ').replace(/ +([.,;:)])/g, '$1').trim(),
    claimed,
    verified,
  };
}
