/**
 * lib/ppt-generator.ts
 *
 * Renders the Dossier deck. Which slides exist is decided in
 * lib/ppt/deck-data.ts; this file draws them.
 *
 * Geometry comes straight from the build spec because the slide is
 * defined at the size the spec is drawn for — 13.333 × 7.5 in — so every
 * position here is the spec's own number, not a converted one.
 *
 * Four masters carry everything (spec section 4):
 *   M1 CONTENT   — eyebrow row, rule, title, standfirst, data field, credit
 *   M2 COVER     — full-bleed photograph with a violet plate over it
 *   M3 DIVIDER   — violet field, ghost numeral, title, photo panel right
 *   M4 STATEMENT — M1's geometry on a violet field, one hero figure
 *
 * House rules enforced at every call site: corner radius 0, no shadows, no
 * gradients, flush-left text, and at most one violet figure per slide —
 * violet marks the problem, so if everything is violet nothing is.
 */

import PptxGenJS from 'pptxgenjs';
import fs from 'fs/promises';
import { ASSETS, assertAssetsReady } from './ppt-assets';
import { BRAND } from './branding/brand';
import { downloadsDir } from './downloads';
import {
  harvestDeckData, buildDeck, describeDeck,
  type DeckSlide, type Metric, type Finding, type Grounding, type SlideSummary,
} from './ppt/deck-data';

const C = BRAND.colors;
const F = BRAND.fonts;
const T = BRAND.type;
const G = BRAND.grid;
const R = BRAND.rules;


// ─── The slice of pptxgenjs this template uses ────────────────────────────────
//
// pptxgenjs ships loose types for its option bags, and the old generator
// leaned on `any` throughout. Declaring the surface actually used keeps the
// slide builders checked without pretending to model the whole library.

type Opts = Record<string, unknown>;

interface Slide {
  background: { color: string };
  addText(text: string, opts: Opts): void;
  addShape(shape: unknown, opts: Opts): void;
  addImage(opts: Opts): void;
}

interface Deck {
  shapes: Record<string, unknown>;
  addSlide(): Slide;
  defineLayout(o: { name: string; width: number; height: number }): void;
  layout:  string;
  author:  string;
  company: string;
  title:   string;
  writeFile(o: { fileName: string }): Promise<string>;
}

export interface PptResult {
  presentationId: string;
  slidesCount:    number;
  downloadUrl:    string;
  generatedDate:  Date;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

/** A 1 pt structural rule, or a 0.5 pt hairline between list rows. */
function rule(
  s: Slide, pptx: Deck,
  x: number, y: number, w: number,
  weight: number = R.structural,
  color:  string = C.ink40,
) {
  s.addShape(pptx.shapes.LINE, { x, y, w, h: 0, line: { color, width: weight } });
}

/** A filled rectangle. Radius is always 0 — the template never rounds. */
function block(s: Slide, pptx: Deck, o: { x: number; y: number; w: number; h: number; color: string }) {
  s.addShape(pptx.shapes.RECTANGLE, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    fill: { color: o.color }, line: { color: o.color, width: 0 },
  });
}

/** Uppercase mono chrome — eyebrows, labels, slide numbers, the credit. */
function chrome(s: Slide, o: {
  text: string; x: number; y: number; w: number;
  color?: string; align?: 'left' | 'right' | 'center'; semi?: boolean;
}) {
  s.addText(o.text.toUpperCase(), {
    x: o.x, y: o.y, w: o.w, h: 0.2,
    fontFace: o.semi === false ? F.mono : F.monoSemi,
    fontSize: T.eyebrow.size,
    charSpacing: T.eyebrow.spacing,
    color: o.color ?? C.ink55,
    align: o.align ?? 'left',
    margin: 0, valign: 'middle',
  });
}

const CREDIT = 'PAISAK4U — UX RESEARCH REPORT';

/**
 * M1 CONTENT. Returns the slide with its chrome already drawn; callers
 * fill the data field between G.fieldTop and G.fieldBottom.
 */
function m1(pptx: Deck, o: { eyebrow: string; number: number; title?: string; standfirst?: string }) {
  const s = pptx.addSlide();
  s.background = { color: C.ground };

  chrome(s, { text: o.eyebrow, x: G.marginX, y: G.eyebrowY - 0.1, w: 8, color: C.violet });
  chrome(s, { text: String(o.number).padStart(2, '0'), x: G.marginX + G.contentW - 2, y: G.eyebrowY - 0.1, w: 2, align: 'right' });
  rule(s, pptx, G.marginX, G.ruleY, G.contentW);

  if (o.title) {
    s.addText(o.title, {
      x: G.marginX, y: G.titleY, w: G.contentW, h: 0.62,
      fontFace: F.displayXBold, fontSize: T.slideTitle.size,
      charSpacing: T.slideTitle.spacing, lineSpacing: T.slideTitle.line,
      color: C.ink, margin: 0, valign: 'top',
    });
  }
  if (o.standfirst) {
    s.addText(o.standfirst, {
      x: G.marginX, y: G.standfirstY, w: G.contentW, h: 0.5,
      fontFace: F.display, fontSize: T.standfirst.size,
      lineSpacing: T.standfirst.size * 1.4, color: C.ink55, margin: 0, valign: 'top',
    });
  }

  chrome(s, { text: CREDIT, x: G.marginX, y: G.creditY, w: G.contentW, align: 'center', semi: false });
  return s;
}

/** M4 VIOLET STATEMENT — M1's geometry with the field as background. */
function m4(pptx: Deck, o: { eyebrow: string; number: number }) {
  const s = pptx.addSlide();
  s.background = { color: C.violet };

  chrome(s, { text: o.eyebrow, x: G.marginX, y: G.eyebrowY - 0.1, w: 8, color: C.onVioletLabel });
  chrome(s, {
    text: String(o.number).padStart(2, '0'),
    x: G.marginX + G.contentW - 2, y: G.eyebrowY - 0.1, w: 2,
    align: 'right', color: C.onVioletLabel,
  });
  // Every rule on a violet slide is 1 pt — no hairlines (spec section 4).
  rule(s, pptx, G.marginX, G.ruleY, G.contentW, R.structural, C.onVioletRule);
  chrome(s, { text: CREDIT, x: G.marginX, y: G.creditY, w: G.contentW, align: 'center', color: C.onVioletLabel, semi: false });
  return s;
}


// ─── Logomark ─────────────────────────────────────────────────────────────────
//
// The uxproof mark, drawn with shapes rather than an embedded image so it
// stays vector in the .pptx and scales without softening. Geometry is the
// brand SVG's, expressed in its own 56-unit box and scaled at draw time —
// keep it in step with UxproofMark (components/top-bar.tsx) and the
// favicon (app/icon.svg).
//
// Only the glyph is drawn, never the violet tile: on the deck it always
// sits on a violet field, where the template's rule is that marks take the
// ground colour. A #7E27FE tile on a #6D4AF5 plate would just be muddy.

/**
 * Draw the mark's glyph at (x, y), `size` inches square.
 *
 * Coordinates are the brand SVG's 56-unit tile after its
 * translate(3.3,3.3) scale(1.9) — the glyph centred at ~61% of the tile.
 * Stroke widths are derived from `size` rather than fixed, so the mark is
 * proportionally identical at the cover's 0.4in and a divider's 0.26in.
 */
function drawLogo(s: Slide, pptx: Deck, x: number, y: number, size: number, color: string) {
  const u  = size / 56;                          // tile units → inches
  const at = (v: number) => v * u;
  const pt = (units: number) => units * u * 72;  // tile units → points

  // Three document lines.
  for (const [bx, by, bw] of [[10.9, 12.04, 33.63], [10.9, 23.44, 10.64], [10.9, 34.84, 10.64]]) {
    block(s, pptx, { x: x + at(bx), y: y + at(by), w: at(bw), h: at(3.99), color });
  }

  // The magnifier: a ring and its handle.
  const r = 9.31;
  s.addShape(pptx.shapes.OVAL, {
    x: x + at(33.7 - r), y: y + at(30.85 - r), w: at(r * 2), h: at(r * 2),
    fill: { type: 'none' }, line: { color, width: pt(3.8) },
  });
  s.addShape(pptx.shapes.LINE, {
    x: x + at(40.29), y: y + at(37.44), w: at(45.1 - 40.29), h: at(43.96 - 37.44),
    line: { color, width: pt(4.18), endArrowType: 'none' },
  });
}

// ─── Cover (M2) ───────────────────────────────────────────────────────────────

function renderCover(pptx: Deck, slide: Extract<DeckSlide, { kind: 'cover' }>, photo: string) {
  const s = pptx.addSlide();
  s.background = { color: C.ink };

  const { width: W, height: H } = BRAND.layout;
  s.addImage({ data: photo, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });

  // Violet plate: 7.78 in wide, left edge on the margin, bottom edge
  // 0.611 in above the slide bottom.
  const plateW = 7.78;
  const plateH = 4.6;
  const plateY = H - G.bottomMargin - plateH;
  block(s, pptx, { x: G.marginX, y: plateY, w: plateW, h: plateH, color: C.violet });

  const padX = G.marginX + 0.5;    // 0.5 in side padding
  const innerW = plateW - 1.0;
  let y = plateY + 0.44;           // 0.44 in top padding

  drawLogo(s, pptx, padX, y, 0.4, C.onVioletHeading);
  y += 0.56;

  chrome(s, { text: `${slide.title} · ${slide.period}`, x: padX, y, w: innerW, color: C.onVioletLabel });
  y += 0.42;

  s.addText(BRAND.app, {
    x: padX, y, w: innerW, h: 1.0,
    fontFace: F.displayXBold, fontSize: T.coverName.size,
    charSpacing: T.coverName.spacing, lineSpacing: T.coverName.line,
    color: C.onVioletHeading, margin: 0, valign: 'top',
  });
  y += 1.05;

  s.addText(slide.title, {
    x: padX, y, w: innerW, h: 0.42,
    fontFace: F.displaySemi, fontSize: 24, color: C.onVioletHeading, margin: 0, valign: 'top',
  });
  y += 0.55;

  s.addText(`Research findings and measures for ${slide.period}.`, {
    x: padX, y, w: innerW, h: 0.34,
    fontFace: F.display, fontSize: 14, color: C.onVioletStandfirst, margin: 0, valign: 'top',
  });
  y += 0.5;

  rule(s, pptx, padX, y, innerW, R.structural, C.onVioletRule);
  y += 0.22;

  // Four-column meta block: label 12 pt mono at 70%, value 13 pt SemiBold.
  const colW = innerW / Math.max(slide.meta.length, 1);
  slide.meta.forEach((m, i) => {
    const x = padX + i * colW;
    chrome(s, { text: m.label, x, y, w: colW - 0.1, color: C.onVioletLabel });
    s.addText(tidyValue(m.value), {
      x, y: y + 0.24, w: colW - 0.1, h: 0.3,
      fontFace: F.displaySemi, fontSize: 13, color: C.onVioletHeading, margin: 0, valign: 'top',
    });
  });

  chrome(s, {
    text: CREDIT, x: padX, y: plateY + plateH - 0.42, w: innerW,
    align: 'center', color: C.onVioletLabel, semi: false,
  });
}

// ─── Section divider (M3) ─────────────────────────────────────────────────────

function renderDivider(pptx: Deck, slide: Extract<DeckSlide, { kind: 'divider' }>, num: number, photo: string) {
  const s = pptx.addSlide();
  s.background = { color: C.violet };

  const { width: W, height: H } = BRAND.layout;
  const panelW = 4.31;   // photograph panel flush to the right edge, full height
  s.addImage({
    data: photo,
    x: W - panelW, y: 0, w: panelW, h: H,
    sizing: { type: 'cover', w: panelW, h: H },
  });

  drawLogo(s, pptx, G.marginX, G.eyebrowY - 0.13, 0.26, C.onVioletHeading);
  chrome(s, { text: `Section ${slide.numeral}`, x: G.marginX + 0.38, y: G.eyebrowY - 0.1, w: 5, color: C.onVioletHeading });

  s.addText(slide.numeral, {
    x: G.marginX, y: 2.05, w: 5, h: 1.8,
    fontFace: F.displayXBold, fontSize: T.ghostNumeral.size,
    charSpacing: T.ghostNumeral.spacing, lineSpacing: T.ghostNumeral.line,
    color: C.deepViolet, margin: 0, valign: 'middle',
  });

  s.addText(slide.title, {
    x: G.marginX, y: 4.05, w: 5.5, h: 0.85,
    fontFace: F.displayXBold, fontSize: T.dividerTitle.size,
    charSpacing: T.dividerTitle.spacing, color: C.onVioletHeading, margin: 0, valign: 'top',
  });

  s.addText(slide.standfirst, {
    x: G.marginX, y: 4.95, w: 4.6, h: 0.7,
    fontFace: F.display, fontSize: T.pullQuote.size,
    lineSpacing: T.pullQuote.size * 1.3, color: C.onVioletStandfirst, margin: 0, valign: 'top',
  });

  chrome(s, { text: String(num).padStart(2, '0'), x: G.marginX, y: H - G.bottomMargin - 0.2, w: 2, color: C.onVioletLabel });
  chrome(s, { text: CREDIT, x: G.marginX, y: G.creditY, w: W - panelW - G.marginX * 2, align: 'center', color: C.onVioletLabel, semi: false });
}

// ─── Executive summary ────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<string, string> = { high: 'Critical', medium: 'Major', low: 'Minor' };

function renderExecSummary(pptx: Deck, slide: Extract<DeckSlide, { kind: 'exec-summary' }>, num: number) {
  const s = m1(pptx, {
    eyebrow: 'Overview', number: num, title: 'Executive Summary',
    standfirst: `${slide.findings.length} issue${slide.findings.length === 1 ? '' : 's'} carry the friction observed this round.`,
  });

  const chipW = 1.04;
  const rowH  = 0.62;
  let y = G.fieldTop;

  slide.findings.forEach(f => {
    const sev = SEVERITY_LABEL[(f.severity ?? '').toLowerCase()] ?? 'Major';

    severityChip(s, pptx, sev, G.marginX, y + 0.06);

    s.addText(f.title, {
      x: G.marginX + chipW + 0.22, y, w: G.contentW - chipW - 2.5, h: rowH - 0.1,
      fontFace: F.display, fontSize: 16, color: C.ink, margin: 0, valign: 'middle',
    });

    if (f.description) {
      // The spec's consequence column is 2.08 in and its examples are two
      // or three words ("Trust collapses"). A sentence wraps to three
      // lines and runs into the row below, so only the opening clause is
      // shown, on one line, with wrapping off.
      s.addText(consequenceOf(f.description), {
        x: G.marginX + G.contentW - 2.08, y, w: 2.08, h: rowH - 0.1,
        fontFace: F.display, fontSize: 13, color: C.ink55,
        align: 'right', margin: 0, valign: 'middle', wrap: false,
      });
    }

    rule(s, pptx, G.marginX, y + rowH, G.contentW, R.hairline, C.ink25);
    y += rowH + 0.12;
  });

  if (slide.closing) {
    s.addText(clamp(slide.closing, 200), {
      x: G.marginX, y: G.fieldBottom - 0.7, w: G.contentW, h: 0.62,
      fontFace: F.displaySemi, fontSize: 16, lineSpacing: 21,
      color: C.deepViolet, margin: 0, valign: 'bottom',
    });
  }
}

// ─── Study at a glance ────────────────────────────────────────────────────────

function renderGlance(pptx: Deck, slide: Extract<DeckSlide, { kind: 'glance' }>, num: number) {
  const s = m1(pptx, { eyebrow: 'Overview', number: num, title: 'Study at a Glance' });

  const gap   = 0.22;
  const n     = slide.metrics.length;
  const cardW = (G.contentW - gap * (n - 1)) / n;
  const cardH = 2.9;

  // Exactly one figure in violet — the weakest metric. Violet marks the
  // problem; if everything is violet, nothing is.
  const worst = indexOfWorst(slide.metrics);

  slide.metrics.forEach((m, i) => {
    const x = G.marginX + i * (cardW + gap);
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: G.fieldTop, w: cardW, h: cardH,
      fill: { type: 'none' }, line: { color: C.ink40, width: R.structural },
    });

    // 75 pt is the spec's metric figure, but a long value ("83.0%") is
    // wider than the card and wraps mid-number. Tidy it first, then step
    // the size down rather than let a figure break across lines.
    const value = tidyValue(m.value);
    s.addText(value, {
      x: x + 0.3, y: G.fieldTop + 0.28, w: cardW - 0.6, h: 1.05,
      fontFace: F.displayXBold, fontSize: figureSize(value, cardW - 0.6),
      charSpacing: T.metricFigure.spacing, lineSpacing: T.metricFigure.line,
      color: i === worst ? C.violet : C.ink, margin: 0, valign: 'top', wrap: false,
    });

    s.addText(m.label, {
      x: x + 0.3, y: G.fieldTop + cardH - 0.95, w: cardW - 0.6, h: 0.44,
      fontFace: F.displaySemi, fontSize: 16, color: C.ink, margin: 0, valign: 'bottom',
    });

    // A change of zero is almost always "no previous value recorded", not
    // "measured and identical" — printing "+0 vs previous" under every
    // card makes a deck look like it has trend data when it has none.
    if (m.change !== undefined && round2(m.change) !== 0) {
      s.addText(`${m.change >= 0 ? '+' : ''}${round2(m.change)} vs previous`, {
        x: x + 0.3, y: G.fieldTop + cardH - 0.5, w: cardW - 0.6, h: 0.3,
        fontFace: F.display, fontSize: T.caption.size, color: C.ink55, margin: 0, valign: 'top',
      });
    }
  });
}

// ─── Finding ──────────────────────────────────────────────────────────────────

function renderFinding(pptx: Deck, slide: Extract<DeckSlide, { kind: 'finding' }>, num: number) {
  const f = slide.finding;
  // Finding slides run title-first — no standfirst (spec, slide 07).
  const s = m1(pptx, { eyebrow: '01 · Findings', number: num, title: clamp(f.title, 52) });

  let y = G.fieldTop;

  // The participant's own words, when the report recorded them. Curly
  // quotes, no italics, no quotation-mark graphic (spec, slide 07).
  if (slide.quote) {
    s.addText(`\u201c${slide.quote.text}\u201d`, {
      x: G.marginX, y, w: G.contentW - 1.5, h: 1.0,
      fontFace: F.display, fontSize: T.pullQuote.size,
      lineSpacing: T.pullQuote.size * 1.3, color: C.ink, margin: 0, valign: 'top',
    });
    y += 1.1;
    if (slide.quote.attribution) {
      chrome(s, { text: slide.quote.attribution, x: G.marginX, y, w: 6 });
      y += 0.42;
    }
  }

  if (f.description) {
    s.addText(f.description, {
      x: G.marginX, y, w: G.contentW - 2.0, h: 1.4,
      fontFace: F.display, fontSize: 16, lineSpacing: 22, color: C.ink55, margin: 0, valign: 'top',
    });
  }

  const sev = SEVERITY_LABEL[(f.severity ?? '').toLowerCase()];
  if (sev) {
    // Severity is a word, so it gets the chip treatment from the executive
    // summary rather than a 52 pt figure slot — that slot is for numbers,
    // and a word set at hero size overflows it and reads as a headline.
    rule(s, pptx, G.marginX, G.fieldBottom - 0.85, G.contentW);
    severityChip(s, pptx, sev, G.marginX, G.fieldBottom - 0.62);
    s.addText('severity assigned this round', {
      x: G.marginX + 1.3, y: G.fieldBottom - 0.62, w: 5, h: 0.26,
      fontFace: F.display, fontSize: 14, color: C.ink55, margin: 0, valign: 'middle',
    });
  }
}

// ─── Findings summary (M4) ────────────────────────────────────────────────────

function renderFindingsSummary(pptx: Deck, slide: Extract<DeckSlide, { kind: 'findings-summary' }>, num: number) {
  const s = m4(pptx, { eyebrow: '01 · Findings', number: num });

  s.addText(slide.headline, {
    x: G.marginX, y: 1.9, w: 5.4, h: 1.9,
    fontFace: F.displayXBold, fontSize: T.heroFigure.size, charSpacing: T.heroFigure.spacing,
    color: C.onVioletHeading, margin: 0, valign: 'middle',
  });
  s.addText(slide.gloss, {
    x: G.marginX, y: 3.95, w: 5.0, h: 0.8,
    fontFace: F.displaySemi, fontSize: T.pullQuote.size, lineSpacing: 25,
    color: C.onVioletHeading, margin: 0, valign: 'top',
  });

  const listX = 7.0;
  const listW = BRAND.layout.width - listX - G.marginX;
  let y = 1.95;
  slide.findings.forEach((f, i) => {
    rule(s, pptx, listX, y, listW, R.structural, C.onVioletRule);
    chrome(s, { text: `F${i + 1}`, x: listX, y: y + 0.14, w: 0.53, color: C.onVioletLabel });
    s.addText(clamp(f.title, 56), {
      x: listX + 0.53, y: y + 0.1, w: listW - 0.53, h: 0.5,
      fontFace: F.displaySemi, fontSize: T.rowTitle.size, charSpacing: T.rowTitle.spacing,
      color: C.onVioletHeading, margin: 0, valign: 'middle',
    });
    y += 0.72;
  });
  rule(s, pptx, listX, y, listW, R.structural, C.onVioletRule);
}

// ─── Trend (drawn with rectangles, never a chart object) ─────────────────────

function renderTrend(pptx: Deck, slide: Extract<DeckSlide, { kind: 'trend' }>, num: number) {
  const series = slide.trend.series[0];
  const s = m1(pptx, {
    eyebrow: '02 · Measures', number: num, title: series.name || 'Trend',
    standfirst: 'Period over period, drawn from your uploaded reports.',
  });

  const values = series.values;
  const labels = slide.trend.labels;
  const plotH  = 2.78;
  const baseY  = G.fieldTop + plotH + 0.4;
  const gap    = 0.33;
  const barW   = (G.contentW - gap * (values.length - 1)) / values.length;
  const max    = Math.max(...values, 1);

  values.forEach((v, i) => {
    const h = Math.max((v / max) * (plotH - 0.5), 0.05);
    const x = G.marginX + i * (barW + gap);
    const y = baseY - h;
    // The final period is the one being reported on — the only violet bar.
    block(s, pptx, { x, y, w: barW, h, color: i === values.length - 1 ? C.violet : C.ink });

    s.addText(String(round2(v)), {
      x, y: y - 0.42, w: barW, h: 0.36,
      fontFace: F.displayXBold, fontSize: T.rowTitle.size, charSpacing: T.rowTitle.spacing,
      color: i === values.length - 1 ? C.deepViolet : C.ink, align: 'center', margin: 0, valign: 'bottom',
    });
    if (labels[i]) {
      s.addText(labels[i], {
        x, y: baseY + 0.1, w: barW, h: 0.3,
        fontFace: F.displaySemi, fontSize: 14, color: C.ink, align: 'center', margin: 0, valign: 'top',
      });
    }
  });

  rule(s, pptx, G.marginX, baseY, G.contentW);
}

// ─── Task performance (spec slide 14) ────────────────────────────────────────

const TASK_TARGET = 90;   // the template's target line

function renderTaskPerformance(
  pptx: Deck,
  slide: Extract<DeckSlide, { kind: 'task-performance' }>,
  num: number,
) {
  const s = m1(pptx, {
    eyebrow: '02 · Measures', number: num, title: 'Task Performance',
    standfirst: 'Success means completed without moderator help.',
  });

  const withRate = slide.tasks.filter(t => typeof t.successRate === 'number');
  const tasks = withRate.length ? withRate : slide.tasks;

  const plotH = 2.78;
  const baseY = G.fieldTop + plotH;
  const gap   = 0.33;
  const barW  = (G.contentW - gap * (tasks.length - 1)) / tasks.length;

  tasks.forEach((t, i) => {
    const x    = G.marginX + i * (barW + gap);
    const rate = t.successRate ?? 0;
    const h    = Math.max((rate / 100) * (plotH - 0.5), 0.04);
    const y    = baseY - h;
    // Ink at or above target, violet below — violet marks the problem.
    const below = rate < TASK_TARGET;
    block(s, pptx, { x, y, w: barW, h, color: below ? C.violet : C.ink });

    s.addText(`${round2(rate)}%`, {
      x, y: y - 0.4, w: barW, h: 0.34,
      fontFace: F.displayXBold, fontSize: T.rowTitle.size, charSpacing: T.rowTitle.spacing,
      color: below ? C.deepViolet : C.ink, align: 'center', margin: 0, valign: 'bottom',
    });

    // Axis block: code, name, then "time · errors".
    s.addText(t.code, {
      x, y: baseY + 0.12, w: barW, h: 0.26,
      fontFace: F.displaySemi, fontSize: 14, color: C.ink, align: 'center', margin: 0, valign: 'top',
    });
    if (t.name) {
      // Two lines of room: a real task name ("Correct a wrong decision")
      // is wider than one bar at this column count.
      s.addText(clamp(t.name, 34), {
        x, y: baseY + 0.4, w: barW, h: 0.5,
        fontFace: F.display, fontSize: 13, lineSpacing: 16,
        color: C.ink55, align: 'center', margin: 0, valign: 'top',
      });
    }
    const meta = [t.medianTime, t.errors !== undefined ? `${t.errors} errors` : '']
      .filter(Boolean).join(' · ');
    if (meta) {
      s.addText(meta, {
        x, y: baseY + 0.92, w: barW, h: 0.26,
        fontFace: F.display, fontSize: 13, color: C.ink55, align: 'center', margin: 0, valign: 'top',
      });
    }
  });

  rule(s, pptx, G.marginX, baseY, G.contentW);
  // Target line across the full plot width.
  const targetY = baseY - (TASK_TARGET / 100) * (plotH - 0.5);
  rule(s, pptx, G.marginX, targetY, G.contentW, R.structural, C.violet);
  chrome(s, {
    text: `Target ${TASK_TARGET}%`,
    x: G.marginX + G.contentW - 2.4, y: targetY - 0.24, w: 2.4, align: 'right', color: C.violet,
  });
}

// ─── SUS by participant (spec slide 17) ──────────────────────────────────────

function renderSusParticipants(
  pptx: Deck,
  slide: Extract<DeckSlide, { kind: 'sus-participants' }>,
  num: number,
) {
  const below = slide.scores.filter(p => p.score < slide.benchmark).length;
  const s = m1(pptx, {
    eyebrow: '02 · Measures', number: num, title: 'SUS by Participant',
    standfirst: `${below} of ${slide.scores.length} scored below the published average; the spread matters more than the mean.`,
  });

  // Inset the plot so the benchmark chip has room on the right.
  const chipW  = 2.72;
  const plotW  = G.contentW - chipW;
  const plotH  = 2.78;
  const baseY  = G.fieldTop + plotH;
  const gap    = 0.14;
  const n      = slide.scores.length;
  const barW   = (plotW - gap * (n - 1)) / n;

  slide.scores.forEach((p, i) => {
    const x = G.marginX + i * (barW + gap);
    const h = Math.max((p.score / 100) * (plotH - 0.5), 0.04);
    const y = baseY - h;
    const under = p.score < slide.benchmark;
    block(s, pptx, { x, y, w: barW, h, color: under ? C.violet : C.ink });

    s.addText(String(round2(p.score)), {
      x, y: y - 0.32, w: barW, h: 0.28,
      fontFace: F.displaySemi, fontSize: 13, color: under ? C.deepViolet : C.ink,
      align: 'center', margin: 0, valign: 'bottom',
    });
    chrome(s, { text: p.participant, x, y: baseY + 0.12, w: barW, align: 'center' });
  });

  rule(s, pptx, G.marginX, baseY, plotW);

  // Benchmark line at the published average, with its chip on the right.
  const benchY = baseY - (slide.benchmark / 100) * (plotH - 0.5);
  rule(s, pptx, G.marginX, benchY, plotW, R.benchmark, C.violet);
  block(s, pptx, { x: G.marginX + plotW + 0.12, y: benchY - 0.22, w: chipW - 0.12, h: 0.44, color: C.violet });
  s.addText(String(slide.benchmark), {
    x: G.marginX + plotW + 0.24, y: benchY - 0.22, w: 0.7, h: 0.44,
    fontFace: F.displayXBold, fontSize: 23, color: C.ground, margin: 0, valign: 'middle',
  });
  chrome(s, {
    text: 'Industry average', x: G.marginX + plotW + 0.95, y: benchY - 0.22, w: chipW - 1.05,
    color: C.ground,
  });
}

// ─── Indicators ───────────────────────────────────────────────────────────────

function renderIndicators(pptx: Deck, slide: Extract<DeckSlide, { kind: 'indicators' }>, num: number) {
  const s = m1(pptx, { eyebrow: '02 · Measures', number: num, title: 'Key UX Indicators' });

  const rowH = 0.66;
  let y = G.fieldTop;
  rule(s, pptx, G.marginX, y, G.contentW);
  y += 0.1;

  slide.metrics.slice(0, 6).forEach((m, i, arr) => {
    s.addText(m.label, {
      x: G.marginX, y, w: G.contentW - 3.2, h: rowH - 0.12,
      fontFace: F.displaySemi, fontSize: T.rowTitle.size, charSpacing: T.rowTitle.spacing,
      color: C.ink, margin: 0, valign: 'middle',
    });
    s.addText(m.value, {
      x: G.marginX + G.contentW - 3.2, y, w: 2.0, h: rowH - 0.12,
      fontFace: F.displayXBold, fontSize: 20, color: C.ink, align: 'right', margin: 0, valign: 'middle',
    });
    if (m.change !== undefined) {
      s.addText(`${m.change >= 0 ? '+' : ''}${round2(m.change)}`, {
        x: G.marginX + G.contentW - 1.1, y, w: 1.1, h: rowH - 0.12,
        fontFace: F.displaySemi, fontSize: T.rowTitle.size, color: C.deepViolet,
        align: 'right', margin: 0, valign: 'middle',
      });
    }
    y += rowH;
    rule(s, pptx, G.marginX, y, G.contentW, i === arr.length - 1 ? R.structural : R.hairline,
         i === arr.length - 1 ? C.ink40 : C.ink25);
    y += 0.06;
  });
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function renderRecommendations(pptx: Deck, slide: Extract<DeckSlide, { kind: 'recommendations' }>, num: number) {
  const s = m1(pptx, { eyebrow: '03 · Response', number: num, title: 'Recommendations' });

  const rowH = 0.78;
  let y = G.fieldTop;
  rule(s, pptx, G.marginX, y, G.contentW);
  y += 0.09;

  slide.items.slice(0, 5).forEach((r, i, arr) => {
    s.addText(String(i + 1), {
      x: G.marginX, y, w: 0.51, h: rowH - 0.12,
      fontFace: F.displayXBold, fontSize: 20, color: C.violet, margin: 0, valign: 'middle',
    });
    s.addText(clamp(r.title, 72), {
      x: G.marginX + 0.51, y, w: G.contentW - 0.51, h: 0.36,
      fontFace: F.displaySemi, fontSize: T.rowTitle.size, charSpacing: T.rowTitle.spacing,
      color: C.ink, margin: 0, valign: 'top',
    });
    if (r.description) {
      s.addText(clamp(r.description, 90), {
        x: G.marginX + 0.51, y: y + 0.34, w: G.contentW - 0.51, h: 0.3,
        fontFace: F.display, fontSize: T.caption.size, color: C.ink55, margin: 0, valign: 'top',
      });
    }
    y += rowH;
    rule(s, pptx, G.marginX, y, G.contentW, i === arr.length - 1 ? R.structural : R.hairline,
         i === arr.length - 1 ? C.ink40 : C.ink25);
    y += 0.05;
  });
}

// ─── Contents ─────────────────────────────────────────────────────────────────

function renderContents(pptx: Deck, slide: Extract<DeckSlide, { kind: 'contents' }>, num: number) {
  const s = m1(pptx, {
    eyebrow: 'Contents', number: num, title: 'Contents',
    standfirst: 'Evidence first, then the measures that quantify it, then the work it implies.',
  });

  const rowH = 0.72;
  let y = G.fieldTop;
  slide.rows.forEach(r => {
    rule(s, pptx, G.marginX, y, G.contentW);
    chrome(s, { text: r.number, x: G.marginX, y: y + 0.2, w: 0.61, color: C.violet });
    s.addText(r.title, {
      x: G.marginX + 0.83, y: y + 0.1, w: G.contentW - 2.5, h: 0.34,
      fontFace: F.displaySemi, fontSize: 19, color: C.ink, margin: 0, valign: 'top',
    });
    s.addText(clamp(r.sub, 92), {
      x: G.marginX + 0.83, y: y + 0.42, w: G.contentW - 2.5, h: 0.26,
      fontFace: F.display, fontSize: T.caption.size, color: C.ink55, margin: 0, valign: 'top',
    });
    y += rowH;
  });
  rule(s, pptx, G.marginX, y, G.contentW);
}

// ─── Appendix ─────────────────────────────────────────────────────────────────

function renderAppendix(pptx: Deck, slide: Extract<DeckSlide, { kind: 'appendix' }>, num: number) {
  // The slide left up during questions, so it stays quiet — no figures,
  // no accent (spec, slide 23).
  const s = m1(pptx, {
    eyebrow: 'Appendix', number: num, title: 'Appendix & Definitions',
    standfirst: 'Every number in this deck traces to a report you uploaded.',
  });

  let y = G.fieldTop;
  rule(s, pptx, G.marginX, y, G.contentW);
  y += 0.16;

  slide.terms.slice(0, 5).forEach((t, i, arr) => {
    s.addText(t.term, {
      x: G.marginX, y, w: 1.94, h: 0.5,
      fontFace: F.displaySemi, fontSize: 16, color: C.ink, margin: 0, valign: 'top',
    });
    s.addText(t.definition, {
      x: G.marginX + 2.22, y, w: G.contentW - 2.22, h: 0.5,
      fontFace: F.display, fontSize: 14, lineSpacing: 18, color: C.ink55, margin: 0, valign: 'top',
    });
    y += 0.62;
    if (i < arr.length - 1) { rule(s, pptx, G.marginX, y, G.contentW, R.hairline, C.ink25); y += 0.1; }
  });
  rule(s, pptx, G.marginX, y, G.contentW);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Critical = violet fill, ground text; anything else = a 1 pt outline. */
function severityChip(s: Slide, pptx: Deck, label: string, x: number, y: number) {
  const w = 1.04, h = 0.26;
  const critical = label === 'Critical';
  if (critical) {
    block(s, pptx, { x, y, w, h, color: C.violet });
  } else {
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { type: 'none' }, line: { color: C.ink40, width: R.structural },
    });
  }
  s.addText(label.toUpperCase(), {
    x, y, w, h,
    fontFace: F.monoSemi, fontSize: T.eyebrow.size, charSpacing: T.eyebrow.spacing,
    color: critical ? C.ground : C.ink, align: 'center', valign: 'middle', margin: 0,
  });
}

/** The opening clause of a consequence, short enough for one line. */
function consequenceOf(description: string): string {
  const first = description.split(/[.;:]/)[0];
  return clamp(first, 26);
}

/**
 * Drop the decimal noise a pipeline leaves on a round number — "71.0" is
 * the same measurement as "71" and half the width at 75 pt.
 */
function tidyValue(v: string): string {
  return v.trim().replace(/(\d)\.0+(?=\D|$)/g, '$1');
}

/** Step the figure down until it fits the card on one line. */
function figureSize(value: string, widthIn: number): number {
  for (const size of [T.metricFigure.size, 60, 48, 38]) {
    if (value.length * 0.52 * (size / 72) <= widthIn) return size;
  }
  return 32;
}

function clamp(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Which metric gets the single violet figure: the one furthest below its
 * own trend, else the first that fell. Returns -1 when nothing is down, so
 * a slide of good news stays entirely ink.
 */
function indexOfWorst(metrics: Metric[]): number {
  let worst = -1;
  let lowest = 0;
  metrics.forEach((m, i) => {
    if (typeof m.change === 'number' && m.change < lowest) { lowest = m.change; worst = i; }
  });
  return worst;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export type { DeckSlide, Finding, Metric, Grounding, SlideSummary };
export { describeDeck };

/** Harvest the plan, gate it against the data, and draw what survives. */
export function planToDeck(plan: unknown, period: string, grounding?: Grounding): DeckSlide[] {
  return buildDeck(harvestDeckData(plan, period, grounding));
}

export interface DeckOptions {
  /**
   * The photograph for the cover and section dividers, as a data URI. The
   * app uploads it already greyscaled (the template never carries a colour
   * tint, and pptxgenjs cannot desaturate). Falls back to the bundled
   * photograph when the user has not chosen one.
   */
  photo?: string;
}

export async function generatePowerPoint(
  deck: DeckSlide[],
  reportLabel?: string,
  options: DeckOptions = {},
): Promise<PptResult> {
  assertAssetsReady();

  // One cast at the boundary rather than `any` through every builder.
  const pptx = new PptxGenJS() as unknown as Deck;
  // Define the slide at the size the spec is drawn for, so its inch
  // positions are used verbatim rather than rescaled.
  pptx.defineLayout({ name: BRAND.layout.name, width: BRAND.layout.width, height: BRAND.layout.height });
  pptx.layout  = BRAND.layout.name;
  pptx.author  = BRAND.app;
  pptx.company = BRAND.app;
  pptx.title   = reportLabel || 'UX Research Report';

  const photo = options.photo || ASSETS.COVER_IMAGE;

  deck.forEach((slide, i) => {
    const num = i + 1;
    switch (slide.kind) {
      case 'cover':            renderCover(pptx, slide, photo); break;
      case 'contents':         renderContents(pptx, slide, num); break;
      case 'exec-summary':     renderExecSummary(pptx, slide, num); break;
      case 'glance':           renderGlance(pptx, slide, num); break;
      case 'divider':          renderDivider(pptx, slide, num, photo); break;
      case 'finding':          renderFinding(pptx, slide, num); break;
      case 'findings-summary': renderFindingsSummary(pptx, slide, num); break;
      case 'trend':            renderTrend(pptx, slide, num); break;
      case 'task-performance': renderTaskPerformance(pptx, slide, num); break;
      case 'sus-participants': renderSusParticipants(pptx, slide, num); break;
      case 'indicators':       renderIndicators(pptx, slide, num); break;
      case 'recommendations':  renderRecommendations(pptx, slide, num); break;
      case 'appendix':         renderAppendix(pptx, slide, num); break;
    }
  });

  const dir = downloadsDir();
  await fs.mkdir(dir, { recursive: true });
  const fileName = `uxproof_report_${Date.now()}.pptx`;
  await pptx.writeFile({ fileName: `${dir}/${fileName}` });

  return {
    presentationId: `ppt_${Date.now()}`,
    slidesCount:    deck.length,
    downloadUrl:    `/api/presentations/file/${fileName}`,
    generatedDate:  new Date(),
  };
}
