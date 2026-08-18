// ─────────────────────────────────────────────────────────────────────────────
// PAISAK4U brand system for uxproof presentation templates.
//
// Derived from paisak4u.com: a strict black / white foundation, generous
// display type, uppercase mono labels, and hairline rules. The website
// itself uses NO accent colours — decks introduce three, used sparingly:
//
//   • violet   — primary accent (KPI cards, chart series, numbering)
//   • graphite — dark neutral surface between black and gray
//   • pink     — secondary accent (change indicators, second chart series)
//
// FONT NOTE:
//   Same faces as paisak4u.com (both on Google Fonts, install locally so
//   PowerPoint can embed/render them):
//     • Display & body → "Schibsted Grotesk"
//       https://fonts.google.com/specimen/Schibsted+Grotesk
//     • Labels, numbers, footers → "IBM Plex Mono"
//       https://fonts.google.com/specimen/IBM+Plex+Mono
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  company:  'PAISAK4U',
  owner:    'Katarzyna Pilarz',
  domain:   'PAISAK4U.COM',
  app:      'uxproof',

  // ── COLOR PALETTE (hex without '#', ready for pptxgenjs) ──────────────────
  colors: {
    // Foundation — mirrors the site tokens (--bg dark / --fg)
    black:      '0A0A0A',
    white:      'FFFFFF',

    // Accents
    violet:     '6C4BF4',   // primary accent — cards, series, numbering
    violetDeep: '5335C9',   // pressed / layered violet surfaces
    graphite:   '2E2E36',   // dark neutral surface (slide 2 background)
    pink:       'FF9ECE',   // secondary accent on dark grounds
    pinkDeep:   'E0559A',   // secondary accent on light grounds

    // Text & rules
    gray:       '6B6B73',   // captions, metadata, de-emphasised text
    rule:       'E5E7EB',   // hairline rules on white (site --rule light)
    ruleDark:   '1A1A1A',   // hairline rules on black (site --rule dark)
  },

  // ── TYPOGRAPHY ─────────────────────────────────────────────────────────────
  fonts: {
    display:      'Schibsted Grotesk Medium',  // hero titles, slide headings
    displayLight: 'Schibsted Grotesk',         // large values, editorial copy
    body:         'Schibsted Grotesk',         // paragraphs, descriptions
    mono:         'IBM Plex Mono',             // labels, numbers, footers
  },

  // ── SLIDE TYPE COLOR KEYS ──────────────────────────────────────────────────
  // Black/white foundation; accents appear inside content, not as washes.
  slideThemes: {
    cover:   { bg: 'FFFFFF', text: '0A0A0A', accent: '6C4BF4' },
    keyData: { bg: '2E2E36', text: 'FFFFFF', accent: '6C4BF4' },
    trend:   { bg: 'FFFFFF', text: '0A0A0A', accent: '6C4BF4' },
    kpi:     { bg: 'FFFFFF', text: '0A0A0A', accent: 'E0559A' },
    issues:  { bg: 'FFFFFF', text: '0A0A0A', accent: '6C4BF4' },
    actions: { bg: 'FFFFFF', text: '0A0A0A', accent: 'E0559A' },
    summary: { bg: '0A0A0A', text: 'FFFFFF', accent: '6C4BF4' },
    closing: { bg: 'FFFFFF', text: '0A0A0A', accent: '6C4BF4' },
  },

  // ── CHART DEFAULTS ─────────────────────────────────────────────────────────
  charts: {
    seriesColors: ['6C4BF4', 'E0559A', '6B6B73'],  // violet, pink, gray
    gridlineColor: 'E5E7EB',
    axisColor:     '6B6B73',
    labelFontFace: 'Schibsted Grotesk',
    labelFontSize: 9,
  },
} as const;

export type SlideThemeKey = keyof typeof BRAND.slideThemes;

export function getSlideTheme(key: SlideThemeKey) {
  return BRAND.slideThemes[key] ?? BRAND.slideThemes.trend;
}
