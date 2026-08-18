// ─────────────────────────────────────────────────────────────────────────────
// Monochrome template system for uxproof presentation decks.
//
// Strictly black / white / gray — no accent colours, no logos. Layout and
// typography follow the original executive-report template: generous
// display type, numbered mono labels, hairline rules.
//
// FONT NOTE:
//   All faces are on Google Fonts; install locally so PowerPoint can
//   embed/render them:
//     • Display & headings → "Space Grotesk"
//     • Body & descriptions → "DM Sans"
//     • Labels, numbers, footers → "DM Mono"
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  app: 'uxproof',

  // ── COLOR PALETTE (hex without '#', ready for pptxgenjs) ──────────────────
  colors: {
    black:    '0A0C0D',   // near-black foundation
    white:    'FFFFFF',
    grayDark: '212529',   // elevated card surfaces on black
    gray:     '6A6E70',   // captions, metadata, axis labels
    divider:  'E0E0E0',   // hairline rules and gridlines on white
  },

  // ── TYPOGRAPHY ─────────────────────────────────────────────────────────────
  fonts: {
    display:      'Space Grotesk Medium',   // hero titles, slide headings
    displayLight: 'Space Grotesk',          // large values, editorial copy
    body:         'DM Sans Medium',         // paragraphs, labels
    bodyDesc:     'DM Sans 18pt Medium',    // optical-size variant for 12pt descriptions
    mono:         'DM Mono',                // numbering, footers
  },

  // ── CHART DEFAULTS ─────────────────────────────────────────────────────────
  charts: {
    seriesColors: ['0A0C0D', '6A6E70'],   // black, gray — monochrome series
    gridlineColor: 'E0E0E0',
    axisColor:     '6A6E70',
    labelFontFace: 'DM Sans',
    labelFontSize: 9,
  },
} as const;
