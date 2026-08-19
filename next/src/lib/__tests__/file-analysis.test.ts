/**
 * Tests for the document-summary guardrail and its deterministic fallback
 * (lib/file-analysis.ts). The AI summary path itself needs Ollama; what is
 * tested here is the gate that decides whether a model summary is allowed
 * to reach the user, and the floor the product stands on when it isn't.
 */

import { describe, it, expect } from 'vitest';
import { summaryNumbersGrounded, fallbackTextSummary, sign } from '../file-analysis';

describe('summaryNumbersGrounded — the summary guardrail', () => {
  const source =
    '[page 1]\nUsability study, Q3 2025. SUS came in at 72.5 with 14 participants. ' +
    '[page 2]\nTask success reached 88.5%; error rate 4.2%. Revenue impact estimated at 1,250 EUR.';

  it('passes a summary whose numbers all appear in the source', () => {
    expect(summaryNumbersGrounded('SUS was **72.5** and task success **88.5%** (p. 2).', source)).toBe(true);
  });

  it('fails a summary containing a number the source never states', () => {
    expect(summaryNumbersGrounded('SUS improved to 74.0 this quarter.', source)).toBe(false);
    expect(summaryNumbersGrounded('Roughly 90% of tasks succeeded.', source)).toBe(false);
  });

  it('exempts small integer counts (≤ 12) — structure, not metrics', () => {
    expect(summaryNumbersGrounded('The document lists 3 issues and 2 recommendations.', source)).toBe(true);
  });

  it('exempts year-like integers (1900–2100)', () => {
    expect(summaryNumbersGrounded('The 2025 study covers Q3.', source)).toBe(true);
  });

  it('does not exempt non-integer small numbers', () => {
    expect(summaryNumbersGrounded('Error rate was 3.9%.', source)).toBe(false);
  });

  it('matches across thousands separators (1,250 in source, 1250 in reply)', () => {
    expect(summaryNumbersGrounded('Estimated impact: 1250 EUR.', source)).toBe(true);
  });

  it('accepts page citations because [page N] markers are part of the source', () => {
    expect(summaryNumbersGrounded('Error rate 4.2% (p. 2).', source)).toBe(true);
  });
});

describe('fallbackTextSummary — the deterministic floor', () => {
  it('reports the word count and quotes the opening of the document', () => {
    const text = 'Usability study for the checkout flow. Fourteen participants completed five tasks.';
    const out = fallbackTextSummary('study.txt', text);
    expect(out).toContain('study.txt');
    expect(out).toContain('11 words');
    expect(out).toContain('Usability study for the checkout flow.');
  });

  it('strips [page N] markers from the excerpt', () => {
    const out = fallbackTextSummary('r.pdf', '[page 1] Intro text here with several words.');
    expect(out).not.toContain('[page 1]');
    expect(out).toContain('Intro text here');
  });
});

describe('sign', () => {
  it('prefixes non-negative numbers with + and leaves negatives to their own sign', () => {
    expect(`${sign(4)}${4}`).toBe('+4');
    expect(`${sign(-3)}${-3}`).toBe('-3');
  });
});
