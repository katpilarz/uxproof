/**
 * lib/ppt-generator.ts
 *
 * Renders the fixed 8-slide uxproof deck from a Sanity slidePlan:
 *
 *   1. Cover            — period + report title, full-colour cover photo right
 *   2. Headline Score   — hero SUS value on black, 4 KPI cards
 *   3. Usability Trend  — SUS / task-success line chart, black side panel
 *   4. UX Indicators    — 8 KPI cards on white
 *   5. Usability Issues — three numbered columns
 *   6. Recommendations  — three numbered columns under a black banner
 *   7. Summary          — editorial narrative on black
 *   8. Thank You        — centred display type, no logo
 *
 * Styling is the original executive-report template geometry in strict
 * monochrome (lib/branding/brand.ts): black / white / gray only, no
 * logos, Space Grotesk + DM Sans + DM Mono throughout.
 *
 * Layout notes preserved from earlier tuning:
 *   - Column titles on slides 5 + 6 render at a SINGLE fixed size (18pt);
 *     overflow is handled by word-boundary truncation at 44 chars, which
 *     matches the planning agent's MAX_COLUMN_TITLE_CHARS_HARD.
 *   - Slide 2 KPI value font 22pt; slide 4 KPI value font 20pt.
 *   - Hero kerning (-2) is reserved for the 88pt cover title and the
 *     64pt "Thank You" — everything else uses default kerning.
 */

import PptxGenJS from 'pptxgenjs';
import fs from 'fs/promises';
import { ASSETS, assertAssetsReady } from './ppt-assets';
import { BRAND } from './branding/brand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlideType = 'title' | 'kpi' | 'trend' | 'issue' | 'insight' | 'summary';

export type BlockType =
  | 'subtitleBlock'
  | 'kpiItem'
  | 'chartBlock'
  | 'issueItem'
  | 'priorityItem';

export interface ContentBlock {
  _type: BlockType;
  _key?: string;
  text?: string;
  label?: string;
  value?: string;
  change?: number;
  trend?: string;
  chartData?: Array<{ name: string; labels: string[]; values: number[] }>;
  title?: string;
  description?: string;
  severity?: string;
}

export interface SlideConfig {
  number:  number;
  title:   string;
  type:    SlideType;
  content?: ContentBlock[];
}

export interface PptResult {
  presentationId: string;
  slidesCount:    number;
  downloadUrl:    string;
  generatedDate:  Date;
}

// ─── Palette & type (monochrome template system) ─────────────────────────────
const C = {
  black:    BRAND.colors.black,
  white:    BRAND.colors.white,
  grayDark: BRAND.colors.grayDark,
  gray:     BRAND.colors.gray,
  divider:  BRAND.colors.divider,
};

const F = {
  heading:      BRAND.fonts.display,       // Space Grotesk Medium
  headingLight: BRAND.fonts.displayLight,  // Space Grotesk
  body:         BRAND.fonts.body,          // DM Sans Medium
  bodyDesc:     BRAND.fonts.bodyDesc,      // DM Sans 18pt Medium
  mono:         BRAND.fonts.mono,          // DM Mono
};

// Kerning. `hero` is the only size large enough that tight tracking reads
// as a design choice rather than crowding — reserved for the 88pt cover
// title and the 64pt "Thank You".
const K = { hero: -2, heading: 0, body: 0 };

// Chrome geometry — slide number top-right, report label bottom-left.
const CH = {
  numX:  9.550, numY:  0.100, numW:  0.349, numH:  0.199,
  footerY:  5.427,
  footerLX: 0.162, footerLW: 2.499,
};

/**
 * Single source of truth for the slide 5 + 6 column-title font size.
 * Titles render at this size REGARDLESS of length, for visual
 * consistency across the three columns. Length is controlled by the
 * planning agent (MAX_COLUMN_TITLE_CHARS_HARD = 44) and the truncation
 * step inside fitColumnTitle below.
 */
const COLUMN_TITLE_SIZE      = 18;
const COLUMN_TITLE_MAX_CHARS = 44;   // matches planning_agent.py hard cap

// ─── Chrome ───────────────────────────────────────────────────────────────────

function addChrome(s: any, num: number, dark: boolean, label: string) {
  const numColor  = dark ? C.white : C.grayDark;
  const footColor = dark ? C.white : C.gray;

  s.addText(String(num).padStart(2, '0'), {
    x: CH.numX, y: CH.numY, w: CH.numW, h: CH.numH,
    fontFace: F.mono, fontSize: 7.5, color: numColor, align: 'right', margin: 0,
  });
  s.addText(label, {
    x: CH.footerLX, y: CH.footerY, w: CH.footerLW, h: 0.114,
    fontFace: F.mono, fontSize: 7.5, color: footColor, margin: 0,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const byType = (content: ContentBlock[] | undefined, t: BlockType) =>
  (content || []).filter((c) => c && c._type === t);

const firstByType = (content: ContentBlock[] | undefined, t: BlockType) =>
  (content || []).find((c) => c && c._type === t);

/**
 * Format a numeric change into a display string with a sign and at most
 * 2 decimal places, stripping trailing zeros. Kills the floating-point
 * garbage that arises when the planning agent derives KPI changes by
 * multiplying (e.g. 9.8 × 1.1 → 10.780000000000001).
 *
 *   formatPct(10.780000000000001)  →  "+10.78%"
 *   formatPct(-0.3)                →  "-0.3%"
 *   formatPct(0)                   →  "+0%"
 */
function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n as number)) return '';
  const rounded = Math.round((n as number) * 100) / 100;
  const fixed = rounded.toFixed(2).replace(/\.?0+$/, '');
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}${fixed}%`;
}

function clampLines(text: string, maxLines: number, charsPerLine: number): string {
  if (!text) return '';
  const normalised = text.replace(/\s+/g, ' ').trim();
  const budget = maxLines * charsPerLine;
  if (normalised.length <= budget) return normalised;
  const truncated = normalised.slice(0, budget);
  const lastFullStop = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? '),
  );
  if (lastFullStop > budget * 0.4) {
    return truncated.slice(0, lastFullStop + 1);
  }
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace).trimEnd() + '…';
  }
  return truncated + '…';
}

function splitCoverTitle(title: string): { period: string; sub: string } {
  if (!title) return { period: 'Report', sub: '' };
  const parts = title.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { period: parts[0], sub: parts.slice(1).join(' ') };
  const m = title.match(/^(.*?)\s+(UX Report|Research Report|Executive Report|Annual Report|Report)\s*$/i);
  if (m) return { period: m[1].trim(), sub: m[2].trim() };
  return { period: title.trim(), sub: '' };
}

/**
 * Fit a slide 5/6 column title into the 2.9" × 1.000" title box at a
 * FIXED font size. Long titles are truncated at a word boundary near
 * 44 chars with "…" rather than scaled down, so the three columns
 * always look consistent.
 */
function fitColumnTitle(raw: string): { text: string; size: number } {
  const t = raw.trim();
  if (t.length <= COLUMN_TITLE_MAX_CHARS) {
    return { text: t, size: COLUMN_TITLE_SIZE };
  }
  const head = t.slice(0, COLUMN_TITLE_MAX_CHARS - 1);
  const lastSpace = head.lastIndexOf(' ');
  const truncated = lastSpace > 0
    ? head.slice(0, lastSpace).trimEnd()
    : head;
  return { text: truncated + '…', size: COLUMN_TITLE_SIZE };
}

// ─── Loader from Sanity slidePlan ─────────────────────────────────────────────

interface SanitySlide {
  slideNumber?: number;
  slideType?:   SlideType;
  title?:       string;
  subtitle?:    string;
  content?:     ContentBlock[];
}

export function loadSlidesFromPlan(plan: any): SlideConfig[] {
  const slides: SanitySlide[] = plan?.slides || [];
  const defaults = buildDefaultSlides();
  const narrative: string | undefined = plan?.narrativeArc;

  const out: SlideConfig[] = [];
  for (let i = 1; i <= 8; i++) {
    const s = slides.find((x) => x.slideNumber === i);
    if (!s) { out.push(defaults[i - 1]); continue; }

    let content: ContentBlock[] = (s.content as ContentBlock[]) || [];

    if (i === 7 && content.length === 0 && narrative) {
      content = [{ _type: 'subtitleBlock', text: narrative }];
    }

    out.push({
      number:  i,
      title:   s.title || defaults[i - 1].title,
      type:    s.slideType || defaults[i - 1].type,
      content,
    });
  }
  return out;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function generatePowerPoint(
  slides:      SlideConfig[],
  reportLabel?: string,
): Promise<PptResult> {
  assertAssetsReady();

  const pptx   = new PptxGenJS();
  pptx.layout  = 'LAYOUT_16x9';
  pptx.author  = BRAND.app;
  pptx.company = BRAND.app;
  pptx.title   = reportLabel || 'UX Executive Report';

  const label = reportLabel || 'UX Executive Report';

  for (const slide of slides) {
    if (slide.number === 8) { addThankYouSlide(pptx, slide, label); continue; }
    switch (slide.type) {
      case 'title':   addCoverSlide(pptx, slide, label); break;
      case 'kpi':
        slide.number === 2
          ? addHeadlineScoreSlide(pptx, slide, label)
          : addKpiDashboardSlide(pptx, slide, label);
        break;
      case 'trend':   addTrendSlide(pptx, slide, label); break;
      case 'issue':   addIssuesSlide(pptx, slide, label); break;
      case 'insight': addRecommendationsSlide(pptx, slide, label); break;
      case 'summary':
        slide.number === 7
          ? addSummarySlide(pptx, slide, label)
          : addThankYouSlide(pptx, slide, label);
        break;
    }
  }

  const isVercel    = process.env.VERCEL === '1';
  const dirBase     = isVercel ? '/tmp' : process.cwd() + '/public';
  const downloadDir = `${dirBase}/downloads`;
  await fs.mkdir(downloadDir, { recursive: true });

  const fileName = `uxproof_report_${Date.now()}.pptx`;
  const filePath = `${downloadDir}/${fileName}`;
  await pptx.writeFile({ fileName: filePath });

  const downloadUrl = isVercel
    ? `/api/presentations/file/${fileName}`
    : `/downloads/${fileName}`;

  return {
    presentationId: `ppt_${Date.now()}`,
    slidesCount:    slides.length,
    downloadUrl,
    generatedDate:  new Date(),
  };
}

// ─── Slide 1: Cover ──────────────────────────────────────────────────────────

function addCoverSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addImage({
    data: ASSETS.COVER_IMAGE,
    x: 5.651, y: 0, w: 4.349, h: 5.625,
    sizing: { type: 'cover', w: 4.349, h: 5.625 },
  });

  const { period, sub } = splitCoverTitle(slide.title);

  s.addText(period, {
    x: 0.079, y: 3.150, w: 5.500, h: 1.450,
    fontFace: F.heading, fontSize: 88, color: C.black, charSpacing: K.hero,
    valign: 'bottom', wrap: false, margin: 0, bold: false,
  });

  if (sub) {
    s.addText(sub, {
      x: 0.079, y: 4.620, w: 5.429, h: 0.500,
      fontFace: F.heading, fontSize: 32, color: C.black, charSpacing: K.heading,
      valign: 'top', wrap: true, margin: 0, bold: false,
    });
  }

  addChrome(s, slide.number, false, label);
}

// ─── Slide 2: Headline Score ─────────────────────────────────────────────────
// Black background; hero SUS value; 4 dark-gray KPI cards. Cards align to
// the title's left edge.

function addHeadlineScoreSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.black };

  const subtitleBlock = firstByType(slide.content, 'subtitleBlock');
  const kpiItems      = byType(slide.content, 'kpiItem');

  s.addText(slide.title || 'SUS —', {
    x: 0.409, y: 1.100, w: 9.199, h: 1.149,
    fontFace: F.heading, fontSize: 75, color: C.white, charSpacing: K.heading,
    margin: 0, bold: false,
  });

  s.addText(subtitleBlock?.text || `${label} usability summary`, {
    x: 0.409, y: 2.521, w: 8.500, h: 0.275,
    fontFace: F.body, fontSize: 14, italic: true, color: C.white, margin: 0,
  });

  // Card layout: card edge aligned with title edge.
  // Card width 1.910, step 2.157 → 4 cards span 0.409 … 8.788.
  const boxXs = [0.409, 2.566, 4.722, 6.878];
  const pctW  = 1.700;

  kpiItems.slice(0, 4).forEach((kpi, i) => {
    const bx = boxXs[i];
    s.addShape(pptx.shapes.RECTANGLE, {
      x: bx, y: 3.380, w: 1.910, h: 1.150,
      fill: { color: C.grayDark }, line: { color: C.grayDark },
    });
    s.addText(kpi.value || '—', {
      x: bx + 0.140, y: 3.470, w: 1.793, h: 0.420,
      fontFace: F.headingLight, fontSize: 22, color: C.white, charSpacing: K.heading,
      margin: 0, bold: false,
    });
    s.addText(kpi.label || '', {
      x: bx + 0.140, y: 3.920, w: 1.690, h: 0.260,
      fontFace: F.body, fontSize: 10, color: C.white, margin: 0,
    });
    if (kpi.change !== undefined && kpi.change !== null) {
      s.addText(formatPct(kpi.change), {
        x: bx + 0.140, y: 4.200, w: pctW, h: 0.260,
        fontFace: F.body, fontSize: 10, bold: true, color: C.white,
        align: 'right', margin: 0,
      });
    }
  });

  addChrome(s, slide.number, true, label);
}

// ─── Slide 3: Usability Trend ────────────────────────────────────────────────
// Black side panel with the title; monochrome line chart. Thick line +
// visible data symbols so single-point series still render.

function addTrendSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 4.349, h: 5.625,
    fill: { color: C.black }, line: { color: C.black },
  });

  s.addText(slide.title || 'Usability\nScore\nTrend', {
    x: 0.250, y: 2.500, w: 3.949, h: 2.899,
    fontFace: F.heading, fontSize: 54, color: C.white, charSpacing: K.heading,
    valign: 'top', wrap: true, margin: 0, bold: false,
  });

  const chartBlock = firstByType(slide.content, 'chartBlock');
  const series = chartBlock?.chartData || [];
  const valid = series.filter(
    (sr) => sr && Array.isArray(sr.labels) && Array.isArray(sr.values) && sr.values.length > 0
  );

  if (valid.length > 0) {
    s.addChart(pptx.charts.LINE, valid, {
      x: 4.500, y: 0.350, w: 5.349, h: 4.999,
      chartColors: [...BRAND.charts.seriesColors],
      lineSize: 3.0, lineSmooth: false,
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 8,
      lineDataSymbolLineSize: 2,
      showLegend: true, legendPos: 'b', legendFontSize: 9, legendFontFace: F.body,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
      catAxisLabelFontFace: F.body, valAxisLabelFontFace: F.body,
      catAxisLabelColor: C.gray, valAxisLabelColor: C.gray,
      valGridLine: { color: C.divider, style: 'solid', size: 0.5 },
      catGridLine: { style: 'none' },
      chartArea: { fill: { color: C.white } },
      showValue: true,
      dataLabelFontSize: 9, dataLabelColor: C.gray, dataLabelFontFace: F.body,
      dataLabelFormatCode: '0.0',
    });
  } else {
    s.addShape(pptx.shapes.RECTANGLE, {
      x: 4.5, y: 0.35, w: 5.35, h: 5.0,
      fill: { color: 'F8F8F8' }, line: { color: C.divider },
    });
    s.addText('SUS & Task Success Trend', {
      x: 5.0, y: 2.5, w: 4.35, h: 0.5,
      fontFace: F.body, fontSize: 13, color: C.gray, align: 'center',
    });
  }

  addChrome(s, slide.number, false, label);
}

// ─── Slide 4: UX Indicators ──────────────────────────────────────────────────
// White ground, 8 black KPI cards.

function addKpiDashboardSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addText(slide.title || 'Key UX Indicators', {
    x: 0.180, y: 0.700, w: 9.639, h: 0.749,
    fontFace: F.heading, fontSize: 40, color: C.black, charSpacing: K.heading,
    margin: 0, bold: false,
  });

  const kpis = byType(slide.content, 'kpiItem');
  const defaultKpis: ContentBlock[] = [
    { _type: 'kpiItem', label: 'SUS Score',         value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Task Success Rate', value: '—', change: 0 },
    { _type: 'kpiItem', label: 'NPS',               value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Error Rate',        value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Participants',      value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Conversion Rate',   value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Avg Time on Task',  value: '—', change: 0 },
    { _type: 'kpiItem', label: 'Findings Resolved', value: '—', change: 0 },
  ];
  const items = kpis.length >= 8 ? kpis.slice(0, 8) : [...kpis, ...defaultKpis].slice(0, 8);

  const colX = [0.266, 2.542, 4.818, 7.094];
  const rowY = [2.000, 3.460];

  items.forEach((kpi, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const bx  = colX[col], by  = rowY[row];

    s.addShape(pptx.shapes.RECTANGLE, {
      x: bx, y: by, w: 2.036, h: 1.250,
      fill: { color: C.black }, line: { color: C.black },
    });
    s.addText(kpi.value || '—', {
      x: bx + 0.140, y: by + 0.150, w: 1.910, h: 0.420,
      fontFace: F.headingLight, fontSize: 20, color: C.white, charSpacing: K.heading,
      margin: 0, bold: false,
    });
    s.addText(kpi.label || '', {
      x: bx + 0.140, y: by + 0.620, w: 1.860, h: 0.260,
      fontFace: F.body, fontSize: 9, color: C.white, margin: 0,
    });
    if (kpi.change !== undefined && kpi.change !== null) {
      s.addText(formatPct(kpi.change), {
        x: bx + 0.140, y: by + 0.900, w: 1.770, h: 0.260,
        fontFace: F.body, fontSize: 9, bold: true, color: C.white,
        align: 'right', margin: 0,
      });
    }
  });

  addChrome(s, slide.number, false, label);
}

// ─── Slide 5: Usability Issues ───────────────────────────────────────────────
// Three numbered columns between hairline rules; numbering in black mono.
// Geometry matches slide 6 EXACTLY — the only difference vs slide 6 is
// the absence of the black banner.

function addIssuesSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addText(slide.title || 'Top Usability Issues', {
    x: 0.180, y: 0.700, w: 9.639, h: 0.800,
    fontFace: F.heading, fontSize: 40, color: C.black, charSpacing: K.heading,
    margin: 0, bold: false,
  });

  // Hairline rules — matched to slide 6: top at 1.900, bottom at 5.150,
  // vertical dividers span the same 3.250" height.
  s.addShape(pptx.shapes.LINE, { x: 0.260, y: 1.900, w: 9.480, h: 0, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 0.260, y: 5.150, w: 9.480, h: 0, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 3.370, y: 1.900, w: 0, h: 3.250, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 6.610, y: 1.900, w: 0, h: 3.250, line: { color: C.gray, width: 0.75 } });

  const issues = byType(slide.content, 'issueItem');
  const colX   = [0.330, 3.500, 6.740];

  issues.slice(0, 3).forEach((issue, i) => {
    const cx = colX[i];
    s.addText(`0${i + 1}`, {
      x: cx, y: 2.060, w: 0.900, h: 0.550,
      fontFace: F.mono, fontSize: 28, color: C.black, charSpacing: 0,
      margin: 0, bold: false,
    });
    const rawTitle = issue.title || `Issue ${i + 1}`;
    const { text: safeTitle, size: titleFontSize } = fitColumnTitle(rawTitle);
    // Title box height 1.000" so 18pt titles wrap to 2 lines cleanly.
    s.addText(safeTitle, {
      x: cx, y: 2.700, w: 2.900, h: 1.000,
      fontFace: F.heading, fontSize: titleFontSize, color: C.black, charSpacing: K.heading,
      wrap: true, valign: 'top', margin: 0, bold: false,
    });
    // Description: DM Sans 18pt Medium at 12pt for a lighter look.
    s.addText((issue.description || '').slice(0, 240) || 'No description.', {
      x: cx, y: 3.800, w: 2.900, h: 1.350,
      fontFace: F.bodyDesc, fontSize: 12, color: C.black, wrap: true, margin: 0, valign: 'top',
    });
  });

  addChrome(s, slide.number, false, label);
}

// ─── Slide 6: Recommendations ────────────────────────────────────────────────
// Black banner (1.902" tall), then the same three-column geometry as
// slide 5; numbering in black mono.

function addRecommendationsSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 1.902,
    fill: { color: C.black }, line: { color: C.black },
  });

  s.addText(slide.title || 'Recommendations', {
    x: 0.181, y: 0.700, w: 9.639, h: 0.800,
    fontFace: F.heading, fontSize: 40, color: C.white, charSpacing: K.heading,
    margin: 0, bold: false,
  });

  s.addShape(pptx.shapes.LINE, { x: 0.260, y: 1.900, w: 9.480, h: 0, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 0.260, y: 5.150, w: 9.480, h: 0, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 3.370, y: 1.900, w: 0, h: 3.250, line: { color: C.gray, width: 0.75 } });
  s.addShape(pptx.shapes.LINE, { x: 6.610, y: 1.900, w: 0, h: 3.250, line: { color: C.gray, width: 0.75 } });

  const items = byType(slide.content, 'priorityItem');
  const defaults: ContentBlock[] = [
    { _type: 'priorityItem', title: 'Fix Checkout Friction', description: 'Address the highest-severity findings in the purchase flow first.' },
    { _type: 'priorityItem', title: 'Simplify Onboarding',   description: 'Reduce steps and clarify progress in first-run experience.' },
    { _type: 'priorityItem', title: 'Accessibility Pass',    description: 'Close remaining WCAG gaps surfaced in the audit.' },
  ];
  const list = items.length >= 3 ? items.slice(0, 3) : defaults;
  const colX = [0.330, 3.500, 6.740];

  list.forEach((item, i) => {
    const cx = colX[i];
    s.addText(`0${i + 1}`, {
      x: cx, y: 2.060, w: 0.900, h: 0.550,
      fontFace: F.mono, fontSize: 28, color: C.black, charSpacing: 0,
      margin: 0, bold: false,
    });
    const rawTitle = item.title || `Recommendation ${i + 1}`;
    const { text: safeTitle, size: titleFontSize } = fitColumnTitle(rawTitle);
    s.addText(safeTitle, {
      x: cx, y: 2.700, w: 2.900, h: 1.000,
      fontFace: F.heading, fontSize: titleFontSize, color: C.black, charSpacing: K.heading,
      wrap: true, valign: 'top', margin: 0, bold: false,
    });
    s.addText((item.description || '').slice(0, 240), {
      x: cx, y: 3.800, w: 2.900, h: 1.350,
      fontFace: F.bodyDesc, fontSize: 12, color: C.black, wrap: true, margin: 0, valign: 'top',
    });
  });

  addChrome(s, slide.number, true, label);
  // Footer label sits on the white area below the banner — redraw in gray
  s.addText(label, {
    x: CH.footerLX, y: CH.footerY, w: CH.footerLW, h: 0.114,
    fontFace: F.mono, fontSize: 7.5, color: C.gray, margin: 0,
  });
}

// ─── Slide 7: Research Summary ───────────────────────────────────────────────

function addSummarySlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.black };

  const subtitleBlock = firstByType(slide.content, 'subtitleBlock');
  const raw = subtitleBlock?.text || 'Key usability findings for the reporting period.';
  // 6-line budget so the planning agent's longer summaries
  // (MAX_NARRATIVE_ARC_CHARS = 330) fit comfortably.
  const clamped = clampLines(raw, 6, 50);

  s.addText(clamped, {
    x: 0.750, y: 1.100, w: 8.500, h: 4.000,
    fontFace: F.headingLight, fontSize: 22, color: C.white,
    align: 'left', valign: 'top', wrap: true, margin: 0, lineSpacingMultiple: 1.30,
    charSpacing: K.heading,
  });

  addChrome(s, slide.number, true, label);
}

// ─── Slide 8: Thank You ──────────────────────────────────────────────────────

function addThankYouSlide(pptx: any, slide: SlideConfig, label: string) {
  const s = pptx.addSlide();
  s.background = { color: C.white };

  s.addText('Thank You', {
    x: 0.260, y: 2.300, w: 9.479, h: 1.000,
    fontFace: F.heading, fontSize: 64, color: C.black, charSpacing: K.hero,
    align: 'center', margin: 0, bold: false,
  });

  const subtitleBlock = firstByType(slide.content, 'subtitleBlock');
  const tagline = subtitleBlock?.text || label;
  s.addText(tagline, {
    x: 0.260, y: 3.300, w: 9.479, h: 0.400,
    fontFace: F.mono, fontSize: 12, color: C.grayDark,
    align: 'center', margin: 0,
  });
}

// ─── Default slides ──────────────────────────────────────────────────────────

export function buildDefaultSlides(): SlideConfig[] {
  return [
    { number: 1, title: 'Q1 2026\nUX Report',          type: 'title',   content: [] },
    { number: 2, title: 'SUS —',                       type: 'kpi',     content: [] },
    { number: 3, title: 'Usability\nScore\nTrend',     type: 'trend',   content: [] },
    { number: 4, title: 'Key UX Indicators',           type: 'kpi',     content: [] },
    { number: 5, title: 'Top Usability Issues',        type: 'issue',   content: [] },
    { number: 6, title: 'Recommendations',             type: 'insight', content: [] },
    { number: 7, title: 'Research Summary',            type: 'summary', content: [] },
    { number: 8, title: 'Thank You',                   type: 'summary', content: [] },
  ];
}
