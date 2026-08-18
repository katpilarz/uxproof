import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';

// Create a fresh Sanity project for uxproof (`npx sanity projects create`
// or sanity.io/manage) and put its ID in sanity-studio/.env as
// SANITY_STUDIO_PROJECT_ID — never hardcode it here.
export default defineConfig({
  name: 'uxproof',
  title: 'uxproof — UX Research CMS',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'your-project-id',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
