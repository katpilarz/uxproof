// Citations are the app's trust anchor: a "(p. 2 ¶3)" a user cannot verify
// is worse than no citation at all. These lock the guarantee that a citation
// is only ever produced from a quote actually present in the document.

import { describe, it, expect } from 'vitest';
import {
  splitParagraphs,
  buildSourceIndex,
  locateQuote,
  formatCitation,
  applyVerifiedCitations,
} from '../source-index';

const PDF_TEXT = [
  '[page 1]',
  'Lumen AI Assistant Usability Study, Round 2.',
  '',
  'Twelve participants were recruited from the existing customer base.',
  '',
  '[page 2]',
  'The SUS score was 71 against a target of 80.',
  '',
  'Trust in AI output dropped from 4.1 to 2.6 after participants encountered questionable summaries.',
].join('\n');

describe('buildSourceIndex', () => {
  it('addresses each paragraph by page and paragraph number', () => {
    const spans = buildSourceIndex(PDF_TEXT);
    expect(spans).toHaveLength(4);
    expect(spans[0]).toMatchObject({ page: 1, para: 1 });
    expect(spans[1]).toMatchObject({ page: 1, para: 2 });
    expect(spans[2]).toMatchObject({ page: 2, para: 1 });
    expect(spans[3]).toMatchObject({ page: 2, para: 2 });
  });

  it('restarts paragraph numbering on each page', () => {
    const spans = buildSourceIndex(PDF_TEXT);
    expect(spans.filter(s => s.para === 1).map(s => s.page)).toEqual([1, 2]);
  });

  it('falls back to paragraphs alone for text with no page markers', () => {
    const spans = buildSourceIndex('First paragraph here.\n\nSecond paragraph here.');
    expect(spans).toEqual([
      { page: null, para: 1, text: 'First paragraph here.' },
      { page: null, para: 2, text: 'Second paragraph here.' },
    ]);
  });

  it('returns nothing for an empty document', () => {
    expect(buildSourceIndex('')).toEqual([]);
    expect(buildSourceIndex('   \n\n  ')).toEqual([]);
  });
});

describe('locateQuote', () => {
  const spans = buildSourceIndex(PDF_TEXT);

  it('finds the paragraph a real quote came from', () => {
    const hit = locateQuote('Trust in AI output dropped from 4.1 to 2.6', spans);
    expect(hit).toMatchObject({ page: 2, para: 2 });
  });

  it('ignores case and whitespace differences', () => {
    const hit = locateQuote('the   sus SCORE was 71 against a target', spans);
    expect(hit).toMatchObject({ page: 2, para: 1 });
  });

  it('matches through curly quotes and en-dashes a PDF layer introduces', () => {
    const curly = buildSourceIndex('[page 1]\nThe user\u2019s trust \u2013 measured post-task \u2013 fell sharply.');
    expect(locateQuote("the user's trust - measured post-task - fell sharply", curly))
      .toMatchObject({ page: 1, para: 1 });
  });

  it('returns null for a quote the document never contains', () => {
    expect(locateQuote('Participants praised the onboarding flow', spans)).toBeNull();
  });

  it('refuses to locate a quote too short to identify anything', () => {
    expect(locateQuote('the', spans)).toBeNull();
    expect(locateQuote('SUS score', spans)).toBeNull();
  });

  it('still locates a quote whose tail the model paraphrased', () => {
    const hit = locateQuote('Twelve participants were recruited, according to the report', spans);
    expect(hit).toMatchObject({ page: 1, para: 2 });
  });
});

describe('formatCitation', () => {
  it('cites page and paragraph for paged documents', () => {
    expect(formatCitation({ page: 2, para: 3, text: '' })).toBe('(p. 2 ¶3)');
  });

  it('cites the paragraph alone when the format has no pages', () => {
    expect(formatCitation({ page: null, para: 4, text: '' })).toBe('(¶4)');
  });
});

describe('applyVerifiedCitations — the trust anchor', () => {
  it('replaces a marker with the location the quote actually occupies', () => {
    const reply = 'Trust fell sharply. ⟦q: Trust in AI output dropped from 4.1 to 2.6⟧';
    const out = applyVerifiedCitations(reply, PDF_TEXT);
    expect(out.text).toBe('Trust fell sharply. (p. 2 ¶2)');
    expect(out).toMatchObject({ claimed: 1, verified: 1 });
  });

  it('DROPS a citation whose quote is not in the document', () => {
    const reply = 'Users loved the onboarding. ⟦q: Participants praised the onboarding flow⟧';
    const out = applyVerifiedCitations(reply, PDF_TEXT);
    expect(out.text).toBe('Users loved the onboarding.');
    expect(out.text).not.toMatch(/p\.\s*\d/);
    expect(out).toMatchObject({ claimed: 1, verified: 0 });
  });

  it('corrects a citation rather than trusting where the model says it is', () => {
    // The model claims page 1; the quote lives on page 2. The quote wins.
    const reply = 'SUS was 71 (p. 1). ⟦q: The SUS score was 71 against a target of 80⟧';
    const out = applyVerifiedCitations(reply, PDF_TEXT);
    expect(out.text).toContain('(p. 2 ¶1)');
  });

  it('keeps the good citations in a reply that also contains a bad one', () => {
    const reply = [
      'SUS was 71. ⟦q: The SUS score was 71 against a target of 80⟧',
      'Onboarding was praised. ⟦q: Participants praised the onboarding flow⟧',
    ].join('\n');
    const out = applyVerifiedCitations(reply, PDF_TEXT);
    expect(out.text).toContain('(p. 2 ¶1)');
    expect(out.text).toContain('Onboarding was praised.');
    expect(out).toMatchObject({ claimed: 2, verified: 1 });
  });

  it('leaves a reply with no markers untouched', () => {
    const out = applyVerifiedCitations('A plain summary with no citations.', PDF_TEXT);
    expect(out).toMatchObject({ text: 'A plain summary with no citations.', claimed: 0, verified: 0 });
  });

  it('never leaves a marker visible to the user', () => {
    const reply = 'One. ⟦q: never appears anywhere in this document⟧ Two. ⟦q: The SUS score was 71⟧';
    const out = applyVerifiedCitations(reply, PDF_TEXT);
    expect(out.text).not.toContain('⟦');
    expect(out.text).not.toContain('⟧');
  });
});

describe('splitParagraphs — de-wrapping a PDF text layer', () => {
  it('uses blank lines when the document has them', () => {
    expect(splitParagraphs('One here.\n\nTwo here.')).toEqual(['One here.', 'Two here.']);
  });

  it('rejoins lines wrapped at the column width into one paragraph', () => {
    // Three full-width lines then a short one: a single wrapped paragraph.
    const body = [
      'Lumen second usability round tested whether users can trust and verify the notes aaaa',
      'without leaving the app entirely, and the core value is landing for most participants',
      'but the interface hides the evidence behind the summary text itself for every person',
      'shipped within one sprint.',
    ].join('\n');
    const paras = splitParagraphs(body);
    expect(paras).toHaveLength(1);
    expect(paras[0]).toContain('Lumen second usability round');
    expect(paras[0]).toContain('shipped within one sprint.');
  });

  it('keeps short standalone lines — headings and metrics — separate', () => {
    const body = [
      'Executive summary',
      'A long body line that runs all the way out to the wrapping column width here ok',
      'and finishes on this shorter second line.',
      '71SUS (TARGET 80)',
      '83%TASK SUCCESS RATE',
    ].join('\n');
    const paras = splitParagraphs(body);
    expect(paras[0]).toBe('Executive summary');
    expect(paras[1]).toContain('A long body line');
    expect(paras).toContain('71SUS (TARGET 80)');
    expect(paras).toContain('83%TASK SUCCESS RATE');
  });

  it('gives a page more than one addressable paragraph', () => {
    // The bug this guards: splitting PDF text on blank lines produced a
    // single paragraph per page, making every citation "¶1".
    const body = Array.from({ length: 6 }, (_, i) => `Short heading ${i + 1}`).join('\n');
    expect(splitParagraphs(body).length).toBeGreaterThan(1);
  });

  it('returns nothing for empty input', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('   ')).toEqual([]);
  });
});
