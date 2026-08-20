// Citations are the trust anchor, so they must survive the trip into the
// chat bubble — but as a quiet chip, not as raw "(p. 2 ¶5)" punctuation.

import { describe, it, expect } from 'vitest';
import { preprocessContent, parseCitation } from '../../components/markdown-message';

describe('preprocessContent — citation tokens', () => {
  it('turns a page + paragraph citation into a token', () => {
    expect(preprocessContent('SUS was 71 (p. 2 ¶5)')).toBe('SUS was 71 `cite:2:5`');
  });

  it('handles a paragraph-only citation, for formats with no pages', () => {
    expect(preprocessContent('Trust fell (¶4)')).toBe('Trust fell `cite::4`');
  });

  it('tolerates the spacing a model actually produces', () => {
    expect(preprocessContent('a (p.2 ¶5) b (p. 10  ¶12) c')).toBe('a `cite:2:5` b `cite:10:12` c');
  });

  it('leaves ordinary parentheses alone', () => {
    const text = 'SUS (target 80) rose to 71.';
    expect(preprocessContent(text)).toBe(text);
  });

  it('converts every citation in a bulleted summary', () => {
    const out = preprocessContent('- SUS: 71 (p. 2 ¶5)\n- Task success: 83% (p. 2 ¶6)');
    expect(out).toContain('`cite:2:5`');
    expect(out).toContain('`cite:2:6`');
    expect(out).not.toContain('¶');
  });
});

describe('parseCitation', () => {
  it('reads a page citation token', () => {
    expect(parseCitation('cite:2:5')).toEqual({ page: '2', para: '5' });
  });

  it('reads a pageless token', () => {
    expect(parseCitation('cite::4')).toEqual({ page: '', para: '4' });
  });

  it('returns null for ordinary inline code, which must still render as code', () => {
    expect(parseCitation('npm run dev')).toBeNull();
    expect(parseCitation('cite:abc')).toBeNull();
    expect(parseCitation(undefined)).toBeNull();
  });

  it('reads a token react-markdown hands over as an array of children', () => {
    expect(parseCitation(['cite:2:5'])).toEqual({ page: '2', para: '5' });
  });
});
