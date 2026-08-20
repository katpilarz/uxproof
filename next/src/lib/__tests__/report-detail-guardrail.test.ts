// The detailed arrays are evidence, so they go through the same rule as
// every metric: what the document does not contain does not survive. A
// fabricated quote is the worst case here — it attributes words to a real
// participant — so it is matched against the source text.

import { describe, it, expect } from 'vitest';
import { groundTasks, groundParticipantScores, groundQuotes } from '../report-parsing';

const SOURCE = `
Task performance. T1 Review stand-up summary 100% 1:12 0 errors.
T2 Find action-item owner 67% 2:48 6 errors. T3 Correct a wrong decision 57% 3:31 9 errors.
SUS per participant: P01 72.5, P02 65, P03 80, P04 57.5.
"Show me the sentence it came from and I'll trust it in a second." P09 · Founder
`;

describe('groundTasks', () => {
  it('keeps a task whose figures appear in the document', () => {
    const [t] = groundTasks([{ code: 'T2', name: 'Find action-item owner', successRate: 67, medianTime: '2:48', errors: 6 }], SOURCE);
    expect(t).toMatchObject({ code: 'T2', successRate: 67, medianTime: '2:48', errors: 6 });
  });

  it('drops a success rate the document never states', () => {
    const [t] = groundTasks([{ code: 'T2', successRate: 71, errors: 6 }], SOURCE);
    expect(t.successRate).toBeUndefined();
    expect(t.errors).toBe(6);
  });

  it('drops a median time the document never states', () => {
    const [t] = groundTasks([{ code: 'T2', medianTime: '9:99', errors: 6 }], SOURCE);
    expect(t.medianTime).toBeUndefined();
  });

  it('discards a row left with no verified figure at all', () => {
    expect(groundTasks([{ code: 'T9', name: 'Invented task', successRate: 42 }], SOURCE)).toEqual([]);
  });

  it('rejects a malformed task code', () => {
    expect(groundTasks([{ code: 'nope', successRate: 67 }], SOURCE)).toEqual([]);
  });

  it('survives junk input', () => {
    expect(groundTasks(null, SOURCE)).toEqual([]);
    expect(groundTasks(['nope', 42], SOURCE)).toEqual([]);
  });
});

describe('groundParticipantScores', () => {
  it('keeps scores stated in the document', () => {
    const out = groundParticipantScores(
      [{ participant: 'P01', score: 72.5 }, { participant: 'P04', score: 57.5 }], SOURCE);
    expect(out).toEqual([{ participant: 'P01', score: 72.5 }, { participant: 'P04', score: 57.5 }]);
  });

  it('drops a participant whose score was invented', () => {
    expect(groundParticipantScores([{ participant: 'P05', score: 91 }], SOURCE)).toEqual([]);
  });

  it('rejects an impossible SUS score', () => {
    expect(groundParticipantScores([{ participant: 'P01', score: 180 }], SOURCE)).toEqual([]);
  });

  it('keeps only the first entry for a repeated participant', () => {
    const out = groundParticipantScores(
      [{ participant: 'P01', score: 72.5 }, { participant: 'P01', score: 65 }], SOURCE);
    expect(out).toHaveLength(1);
  });
});

describe('groundQuotes — words put in a participant\'s mouth', () => {
  it('keeps a quote the document contains', () => {
    const [q] = groundQuotes(
      [{ text: "Show me the sentence it came from and I'll trust it in a second.", attribution: 'P09 · Founder' }],
      SOURCE);
    expect(q.text).toContain('Show me the sentence');
    expect(q.attribution).toBe('P09 · Founder');
  });

  it('DROPS a quote the document does not contain', () => {
    expect(groundQuotes([{ text: 'This product completely changed how our team works.' }], SOURCE)).toEqual([]);
  });

  it('matches through the curly quotes a PDF layer introduces', () => {
    const curly = 'He said “I fixed three things and it all went” afterwards.';
    const [q] = groundQuotes([{ text: 'I fixed three things and it all went' }], curly);
    expect(q).toBeDefined();
  });

  it('strips the wrapping quotation marks the model adds', () => {
    const [q] = groundQuotes([{ text: '"Show me the sentence it came from and I\'ll trust it in a second."' }], SOURCE);
    expect(q.text.startsWith('"')).toBe(false);
  });

  it('drops an attribution the document never states, keeping the quote', () => {
    const [q] = groundQuotes(
      [{ text: "Show me the sentence it came from and I'll trust it in a second.", attribution: 'P77 · Nobody' }],
      SOURCE);
    expect(q.text).toBeTruthy();
    expect(q.attribution).toBeUndefined();
  });

  it('ignores a fragment too short to be a quotation', () => {
    expect(groundQuotes([{ text: 'trust it' }], SOURCE)).toEqual([]);
  });
});

describe('quotes containing commas — the regression that hid every quote', () => {
  // The guard was handed a comma-stripped copy of the document (built for
  // numeric matching), so any quote with a comma in it could never match.
  // Real quotes are full of commas.
  const doc = 'P04 said: "It got the decision right, but the wrong person owns it, which means re-reading."';

  it('matches a quote that contains commas', () => {
    const [q] = groundQuotes(
      [{ text: 'It got the decision right, but the wrong person owns it, which means re-reading.' }],
      doc);
    expect(q).toBeDefined();
  });

  it('still rejects an invented quote that contains commas', () => {
    expect(groundQuotes(
      [{ text: 'It was fast, reliable, and everyone on the team loved using it.' }], doc))
      .toEqual([]);
  });

  it('still matches numbers written with thousands separators', () => {
    const scores = groundParticipantScores([{ participant: 'P01', score: 72.5 }], 'P01 scored 72.5 of 1,250 total');
    expect(scores).toHaveLength(1);
  });
});
