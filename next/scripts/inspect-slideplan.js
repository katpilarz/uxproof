#!/usr/bin/env node
/**
 * scripts/inspect-slideplan.js
 *
 * CLI to inspect exactly what's stored in Sanity for a slidePlan document.
 *
 * USAGE
 * =====
 *   node scripts/inspect-slideplan.js --quarter Q3 --year 2024
 *   node scripts/inspect-slideplan.js --reportId report_q3_2024
 *   node scripts/inspect-slideplan.js --id slideplan_report_q3_2024
 *   node scripts/inspect-slideplan.js --list                  # list all slidePlans
 *
 *   # Compare with what the planner SHOULD have written:
 *   node scripts/inspect-slideplan.js --quarter Q3 --year 2024 --full
 *
 * OUTPUT
 * ======
 * Prints a compact summary by default:
 *   slide N (slideType): contentBlocks=K  blockTypes=[...]
 *
 * With --full, prints the entire slidePlan document as pretty JSON so you
 * can see the actual stored values for every kpiItem, riskItem, etc.
 *
 * If contentBlocks=0 on slides 2,4,5,6,7 — the planner never wrote them.
 * If contentBlocks > 0 but the .pptx renders empty — the API route isn't
 * fetching with the new getSlidePlan helper.
 *
 * REQUIRES
 * ========
 *   .env with SANITY_PROJECT_ID, SANITY_DATASET (or NEXT_PUBLIC_*),
 *   SANITY_API_TOKEN (read access is enough)
 *   @sanity/client installed (you already have it for the app)
 */

const { createClient } = require('@sanity/client');

// Tolerate either NEXT_PUBLIC_* or non-public env names
const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID || '';
const DATASET    = process.env.NEXT_PUBLIC_SANITY_DATASET    || process.env.SANITY_DATASET    || 'production';
const TOKEN      = process.env.SANITY_API_TOKEN || '';

if (!PROJECT_ID || !TOKEN) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_API_TOKEN in env. Aborting.');
  process.exit(1);
}

const client = createClient({
  projectId:  PROJECT_ID,
  dataset:    DATASET,
  apiVersion: '2024-01-01',
  token:      TOKEN,
  useCdn:     false,
});

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);

const quarter   = arg('quarter');
const year      = arg('year');
const reportId  = arg('reportId');
const slideId   = arg('id');
const isList    = flag('list');
const showFull  = flag('full');

// ── Critical query — content[] spread is the bit that matters ──────────────
const SLIDE_PLAN_PROJECTION = `{
  _id, _type, reportId, period, presentationTitle, totalSlides, narrativeArc, generatedAt,
  slides[]{
    _key, slideNumber, slideType, title, subtitle, speakerNotes,
    content[]{ ..., chartData[]{ ... } },
    bullets[]{ _key, text }
  }
}`;

(async () => {
  // ── --list: show every slidePlan in the dataset ──────────────────────────
  if (isList) {
    const all = await client.fetch(
      `*[_type == "slidePlan"] | order(generatedAt desc) {
         _id, reportId, period, generatedAt, totalSlides,
         "slideCount": count(slides),
         "slidesWithContent": count(slides[count(content) > 0])
      }`,
    );
    if (!all.length) {
      console.log('No slidePlan documents found in dataset', DATASET);
      return;
    }
    console.log(`Found ${all.length} slidePlan documents:\n`);
    for (const p of all) {
      console.log(`  ${p._id}`);
      console.log(`    period=${p.period}  reportId=${p.reportId}`);
      console.log(`    slides=${p.slideCount}  with-content=${p.slidesWithContent}  generated=${p.generatedAt}`);
    }
    return;
  }

  // ── Resolve a single slidePlan ──────────────────────────────────────────
  let plan;
  if (slideId) {
    plan = await client.fetch(
      `*[_type == "slidePlan" && _id == $id][0] ${SLIDE_PLAN_PROJECTION}`,
      { id: slideId },
    );
  } else if (reportId) {
    plan = await client.fetch(
      `*[_type == "slidePlan" && reportId == $reportId][0] ${SLIDE_PLAN_PROJECTION}`,
      { reportId },
    );
  } else if (quarter && year) {
    // Resolve quarter+year → reportId → slidePlan
    const report = await client.fetch(
      `*[_type == "report" && quarter == $q && year == $y][0]{ _id, reportId }`,
      { q: quarter, y: parseInt(year, 10) },
    );
    if (!report) {
      console.error(`No report found for ${quarter} ${year}.`);
      console.error('Run with --list to see all slidePlans.');
      process.exit(2);
    }
    const lookupId = report.reportId || report._id;
    console.log(`Resolved ${quarter} ${year} → reportId=${lookupId}`);
    plan = await client.fetch(
      `*[_type == "slidePlan" && reportId == $reportId][0] ${SLIDE_PLAN_PROJECTION}`,
      { reportId: lookupId },
    );
  } else {
    console.error('Usage:');
    console.error('  --list');
    console.error('  --quarter Q3 --year 2024');
    console.error('  --reportId <id>');
    console.error('  --id <slidePlan _id>');
    console.error('  add --full to dump entire document');
    process.exit(1);
  }

  if (!plan) {
    console.error('No slidePlan found for the given key.');
    console.error('Try --list to see all slidePlans.');
    process.exit(2);
  }

  // ── Always print summary ────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  console.log(`_id:               ${plan._id}`);
  console.log(`reportId:          ${plan.reportId}`);
  console.log(`period:            ${plan.period}`);
  console.log(`generatedAt:       ${plan.generatedAt}`);
  console.log(`totalSlides:       ${plan.totalSlides}`);
  console.log(`narrativeArc:      ${plan.narrativeArc ? plan.narrativeArc.slice(0, 80) + '…' : '(empty)'}`);
  console.log('──────────────────────────────────────────────');
  console.log('per-slide content[] block summary:\n');

  for (const s of plan.slides || []) {
    const content = s.content || [];
    const types = content.map((c) => c?._type || '<no _type>');
    const n = String(s.slideNumber).padStart(2, '0');
    console.log(`  slide ${n} (${s.slideType.padEnd(10)}) title="${(s.title || '').slice(0, 30)}"`);
    console.log(`           content blocks: ${content.length}  types: ${JSON.stringify(types)}`);
    if (content.length > 0 && !showFull) {
      // Show a one-line peek at each block so you can sanity-check values
      for (const c of content) {
        const peek = JSON.stringify(c).slice(0, 100);
        console.log(`           - ${peek}${peek.length === 100 ? '…' : ''}`);
      }
    }
  }
  console.log('');

  // ── Full dump on demand ────────────────────────────────────────────────
  if (showFull) {
    console.log('FULL DOCUMENT:');
    console.log(JSON.stringify(plan, null, 2));
  }
})().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});