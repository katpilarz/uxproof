// ─────────────────────────────────────────────────────────────────────────────
// Dossier template system for uxproof presentation decks.
//
// Transcribed from "TEMPLATE C · DOSSIER · POWERPOINT BUILD SPEC · V1.0".
// This file is the single source of truth: never hardcode a colour, face,
// size or margin anywhere else in the deck code.
//
// GEOMETRY. The spec is drawn on a 1920 × 1080 px artboard and states the
// mapping px ÷ 144 → inches, giving a 13.333 × 7.5 in slide. The generator
// defines that as a custom pptxgenjs layout (LAYOUT), so every position in
// the spec can be used VERBATIM — no rescaling step to get wrong.
//
// WEIGHTS. pptxgenjs only exposes bold on/off, so each weight is addressed
// by its own family name, the way PowerPoint resolves them. Install these
// from Google Fonts before opening the file or it will reflow:
//     Schibsted Grotesk (ExtraBold 800, SemiBold 600, Regular 400)
//     IBM Plex Mono (SemiBold, Regular)
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  app: 'uxproof',

  /** The slide the spec is drawn for: 1920 × 1080 px ÷ 144. */
  layout: { name: 'DOSSIER_16x9', width: 13.333, height: 7.5 },

  // ── PALETTE (hex without '#', ready for pptxgenjs) ────────────────────────
  // Flat equivalents for the ink tints — the spec is explicit that solid
  // fills are used rather than opacity, which PowerPoint handles poorly.
  colors: {
    ground:     'F3F2F2',   // slide background — never pure white
    ink:        '201E1D',   // headings, body, on-target bars
    violet:     '6D4AF5',   // eyebrows, violet fields, problem figures, target lines
    deepViolet: '4620AE',   // violet text at paragraph size, ghost numerals
    paleViolet: 'B3A1FB',   // third band in a stacked bar
    ink55:      '7F7D7D',   // standfirsts, captions, slide numbers, secondary labels
    ink40:      '9F9D9D',   // 1 pt structural rules, card borders
    ink25:      'BEBDBD',   // 0.5 pt hairlines between list rows
    ink15:      'D3D2D2',   // bar-chart tracks, unfilled proportion

    // On a violet field the text is the ground colour, stepped down.
    onVioletHeading:    'F3F2F2',   // full strength
    onVioletStandfirst: 'DFD9F2',   // 85%
    onVioletLabel:      'CBC0F3',   // 70%
    onVioletRule:       'B09EF4',   // 50%
  },

  // ── TYPE ──────────────────────────────────────────────────────────────────
  fonts: {
    displayXBold: 'Schibsted Grotesk ExtraBold',  // figures, headings
    displaySemi:  'Schibsted Grotesk SemiBold',   // row titles, values
    display:      'Schibsted Grotesk',            // body
    monoSemi:     'IBM Plex Mono SemiBold',       // eyebrows, labels, numbers
    mono:         'IBM Plex Mono',                // chrome, footer credit
  },

  /**
   * The type scale, verbatim from section 3. `spacing` is character
   * spacing in points (negative = tighter); `line` is exact line spacing
   * in points where the spec fixes one.
   */
  type: {
    coverName:      { size: 68,  spacing: -2.4, line: 61  },
    ghostNumeral:   { size: 150, spacing: -6,   line: 123 },
    dividerTitle:   { size: 52,  spacing: -1.8 },
    heroFigure:     { size: 140, spacing: -6 },
    heroFigureXL:   { size: 170, spacing: -8 },
    metricFigure:   { size: 75,  spacing: -3.4, line: 65 },
    statFigure:     { size: 52,  spacing: -1.5 },
    statFigureSm:   { size: 38,  spacing: -1.5 },
    slideTitle:     { size: 32,  spacing: -0.8, line: 34 },
    pullQuote:      { size: 19,  spacing: 0 },
    rowTitle:       { size: 17,  spacing: -0.3 },
    standfirst:     { size: 15,  spacing: 0 },
    body:           { size: 15,  spacing: 0 },
    caption:        { size: 12.5, spacing: 0 },
    eyebrow:        { size: 12,  spacing: 0.5 },
    footer:         { size: 12,  spacing: 1 },
  },

  /**
   * Master geometry, in inches from the top-left of the slide (section 4).
   * M1 CONTENT carries most slides; the others reuse its margins.
   */
  grid: {
    marginX:       0.667,   // side margins
    contentW:      12,      // 13.333 − 2 × 0.667
    eyebrowY:      0.556,
    ruleY:         0.93,
    titleY:        1.22,
    standfirstY:   1.95,
    fieldTop:      2.6,
    fieldBottom:   6.89,
    creditY:       7.03,
    bottomMargin:  0.611,
  },

  /** Rule weights. The spec uses exactly three. */
  rules: {
    structural: 1,     // 1 pt — ink 40%, or #B09EF4 on a violet field
    hairline:   0.5,   // 0.5 pt — ink 25%, between list rows
    benchmark:  1.75,  // 1.75 pt — the SUS benchmark line
  },
} as const;

/**
 * Nothing in this template rounds: corner radius 0 on every rectangle,
 * chip and card; no shadows, no gradients, no outlines beyond the ones
 * the spec names. Applied at every shape call site.
 */
export const SHARP = { rectRadius: 0 } as const;
