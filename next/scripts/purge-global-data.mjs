// scripts/purge-global-data.mjs
//
// One-time migration for the upload-based data model: removes the GLOBAL
// (unowned) seed data from the Sanity dataset so every user's workspace
// starts empty and all research data comes from their own uploads.
//
// Deletes:
//   • report docs without an owner        (the bundled Aurelo demo data)
//   • presentation docs without an owner  (pre-auth generated decks)
//   • all slidePlan docs                  (derived from the deleted reports)
//   • all executive-intelligence docs     (derived from the deleted reports)
//
// Keeps: users, chat sessions, user files, and any user-owned reports or
// presentations. The demo data can always be restored with
//   cd sanity-studio && npx sanity dataset import seed-reports.ndjson production --replace
//
// Run from next/:  npm run purge:global-data

import { readFileSync } from 'node:fs';
import { createClient } from '@sanity/client';

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

const TARGETS = {
  'global reports (no owner)':       '*[_type == "report" && !defined(user)]',
  'global presentations (no owner)': '*[_type == "presentation" && !defined(user)]',
  'slide plans':                     '*[_type == "slidePlan"]',
  'intelligence docs':               '*[_type in ["executiveIntelligence", "executed_intelligence", "executive_intelligence"]]',
};

console.log(`Dataset: ${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'}\n`);

for (const [label, query] of Object.entries(TARGETS)) {
  const count = await client.fetch(`count(${query})`);
  if (!count) {
    console.log(`• ${label}: nothing to delete`);
    continue;
  }
  const res = await client.delete({ query });
  console.log(`• ${label}: deleted ${res.results?.length ?? count}`);
}

console.log('\nRemaining:');
console.log('  reports:',       await client.fetch('count(*[_type == "report"])'), '(user-owned)');
console.log('  presentations:', await client.fetch('count(*[_type == "presentation"])'), '(user-owned)');
console.log('\nDone — all research data now comes from user uploads.');
