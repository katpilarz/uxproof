import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';

// The uxproof project (ygdze74e) — a Sanity project ID is public
// information; override via SANITY_STUDIO_PROJECT_ID in .env if needed.
export default defineConfig({
  name: 'uxproof',
  title: 'uxproof — UX Research CMS',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'ygdze74e',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
