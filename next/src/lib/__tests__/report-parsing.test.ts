/**
 * Tests for the upload trust boundary (lib/report-parsing.ts).
 *
 * These encode the product's core invariant — the LLM never invents data:
 * structured rows are accepted only with a valid period and a finite SUS
 * score, and model-extracted numbers survive only when they appear
 * literally in the source document.
 */

import { describe, it, expect } from 'vitest';
import {
  toReport,
  parseJsonReports,
  parseCsvReports,
  splitCsvLine,
  numberAppearsIn,
  salvageScalarFields,
  SEVERITY_MAP,
} from '../report-parsing';

describe('toReport — the structured acceptance gate', () => {
  it('accepts a row with valid quarter, year and susScore', () => {
    const r = toReport({ quarter: 'Q3', year: 2025, susScore: 74.5 });
    expect(r).toEqual({ quarter: 'Q3', year: 2025, susScore: 74.5 });
  });

  it('normalises quarter case and whitespace', () => {
    expect(toReport({ quarter: ' q2 ', year: '2024', susScore: '68' }))
      .toMatchObject({ quarter: 'Q2', year: 2024, susScore: 68 });
  });

  it.each([
    ['missing quarter', { year: 2025, susScore: 70 }],
    ['invalid quarter', { quarter: 'Q5', year: 2025, susScore: 70 }],
    ['prose quarter', { quarter: 'third quarter', year: 2025, susScore: 70 }],
    ['year below range', { quarter: 'Q1', year: 1999, susScore: 70 }],
    ['year above range', { quarter: 'Q1', year: 2101, susScore: 70 }],
    ['missing susScore', { quarter: 'Q1', year: 2025 }],
    ['non-numeric susScore', { quarter: 'Q1', year: 2025, susScore: 'high' }],
  ])('rejects a row with %s', (_label, row) => {
    expect(toReport(row as Record<string, unknown>)).toBeNull();
  });

  it('canonicalises header aliases (sus, sample_size, completion-rate…)', () => {
    const r = toReport({
      Q: 'Q4', Year: 2025, SUS: 71,
      'sample_size': 12, 'completion-rate': 88.5, nps: -3,
    });
    expect(r).toMatchObject({
      quarter: 'Q4', year: 2025, susScore: 71,
      participants: 12, taskSuccessRate: 88.5, npsScore: -3,
    });
  });

  it('carries optional numeric fields only when finite', () => {
    const r = toReport({ quarter: 'Q1', year: 2025, susScore: 70, errorRate: 'n/a' });
    expect(r).not.toHaveProperty('errorRate');
  });

  it('keeps only well-shaped issue/insight/kpi members and stamps _key', () => {
    const r = toReport({
      quarter: 'Q1', year: 2025, susScore: 70,
      issues: [
        { title: 'Checkout confusion', description: 'Users stall on step 3' },
        { title: 'no description — dropped' },
        'not an object',
      ],
      kpis: [{ label: 'SUS', value: '70' }, { label: 42, value: 'bad label type' }],
    });
    expect(r?.issues).toEqual([
      { _key: 'k0', title: 'Checkout confusion', description: 'Users stall on step 3' },
    ]);
    expect(r?.kpis).toEqual([{ _key: 'k0', label: 'SUS', value: '70' }]);
  });
});

describe('parseJsonReports', () => {
  it('parses a bare array, a {reports: []} wrapper, and a single object', () => {
    const row = { quarter: 'Q1', year: 2025, susScore: 70 };
    expect(parseJsonReports(JSON.stringify([row]))).toHaveLength(1);
    expect(parseJsonReports(JSON.stringify({ reports: [row, row] }))).toHaveLength(2);
    expect(parseJsonReports(JSON.stringify(row))).toHaveLength(1);
  });

  it('drops invalid rows instead of failing the whole file', () => {
    const rows = [
      { quarter: 'Q1', year: 2025, susScore: 70 },
      { quarter: 'Q9', year: 2025, susScore: 70 },
    ];
    expect(parseJsonReports(JSON.stringify(rows))).toHaveLength(1);
  });

  it('returns [] for malformed JSON and non-report JSON', () => {
    expect(parseJsonReports('{not json')).toEqual([]);
    expect(parseJsonReports('"just a string"')).toEqual([]);
  });
});

describe('parseCsvReports', () => {
  it('parses header + rows with alias headers', () => {
    const csv = 'quarter,year,sus,participants\nQ1,2025,68.5,12\nQ2,2025,71,14';
    const rs = parseCsvReports(csv);
    expect(rs).toHaveLength(2);
    expect(rs[1]).toMatchObject({ quarter: 'Q2', susScore: 71, participants: 14 });
  });

  it('supports quoted cells with embedded commas and escaped quotes', () => {
    expect(splitCsvLine('Q1,"Acme, Inc.","She said ""hi"""'))
      .toEqual(['Q1', 'Acme, Inc.', 'She said "hi"']);
    const csv = 'quarter,year,susScore,client\nQ1,2025,70,"Acme, Inc."';
    expect(parseCsvReports(csv)[0]).toMatchObject({ client: 'Acme, Inc.' });
  });

  it('returns [] for a header-only file and skips invalid rows', () => {
    expect(parseCsvReports('quarter,year,susScore')).toEqual([]);
    const csv = 'quarter,year,susScore\nQ1,2025,70\nQ1,2025,not-a-number';
    expect(parseCsvReports(csv)).toHaveLength(1);
  });
});

describe('numberAppearsIn — the grounding gate', () => {
  const source = 'The Q3 study (n=14) measured a SUS of 72.5, up from 68. Error rate fell to 4.2%.';

  it('accepts values written literally in the source', () => {
    expect(numberAppearsIn(source, 72.5)).toBe(true);
    expect(numberAppearsIn(source, '68')).toBe(true);
    expect(numberAppearsIn(source, 4.2)).toBe(true);
  });

  it('rejects values not present — the model may not invent numbers', () => {
    expect(numberAppearsIn(source, 74)).toBe(false);
    expect(numberAppearsIn(source, 72.6)).toBe(false);
  });

  it('is deliberately conservative: differently-written values are dropped too', () => {
    // "seventy-two" in prose, or a European decimal comma, does not match —
    // false negatives are preferred over a false positive in a client deck.
    expect(numberAppearsIn('SUS was seventy-two this quarter', 72)).toBe(false);
    expect(numberAppearsIn('conversion was 7,2 percent', 7.2)).toBe(false);
  });

  it('normalises a float with a .0 tail to its integer rendering', () => {
    expect(numberAppearsIn('SUS of 72 exactly', 72.0)).toBe(true);
  });

  it('rejects non-numeric values outright', () => {
    expect(numberAppearsIn(source, 'high')).toBe(false);
    expect(numberAppearsIn(source, null)).toBe(false);
  });
});

describe('salvageScalarFields — truncated model replies', () => {
  it('recovers scalar metrics from a JSON prefix cut off mid-array', () => {
    const truncated =
      '{"quarter": "Q2", "year": 2025, "susScore": 71.5, "npsScore": -2, ' +
      '"client": "Aurelo", "issues": [{"title": "Checkout confu';
    expect(salvageScalarFields(truncated)).toMatchObject({
      quarter: 'Q2', year: 2025, susScore: 71.5, npsScore: -2, client: 'Aurelo',
    });
  });

  it('returns null when there is no susScore — no grounded score, no report', () => {
    expect(salvageScalarFields('{"quarter": "Q2", "year": 2025, "npsScore": 4')).toBeNull();
  });
});

describe('SEVERITY_MAP — normalising model drift off the low|medium|high scale', () => {
  it('maps common out-of-scale labels instead of losing the issue', () => {
    expect(SEVERITY_MAP['critical']).toBe('high');
    expect(SEVERITY_MAP['major']).toBe('high');
    expect(SEVERITY_MAP['moderate']).toBe('medium');
    expect(SEVERITY_MAP['trivial']).toBe('low');
  });
});
