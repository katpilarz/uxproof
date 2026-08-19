// lib/downloads.ts
//
// Single source of truth for where generated .pptx decks are written.
// Decks live OUTSIDE `public/` so the only way to fetch one is the
// authenticated /api/presentations/file/[filename] route — files under
// `public/` are served statically to anyone with the URL.

import path from 'path';

export function downloadsDir(): string {
  return process.env.VERCEL === '1'
    ? '/tmp/downloads'
    : path.join(process.cwd(), 'downloads');
}
