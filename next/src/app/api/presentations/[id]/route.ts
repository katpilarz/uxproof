// app/api/presentations/[id]/route.ts
//
// DELETE — remove one generated presentation from the signed-in user's
// dashboard. Ownership is checked against the document's user reference
// before anything is deleted, so an id guessed from another account is a
// 404 rather than a deletion.
//
// The rendered .pptx is removed alongside the record: leaving the binary
// behind would keep a deleted deck downloadable to anyone who kept the
// URL. That unlink is best-effort — the files in downloadsDir() are
// ephemeral anyway, so a missing one is not a failure.

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@sanity/client';
import { getCurrentUser } from '@/lib/auth';
import { deletePresentationDoc } from '@/lib/sanity';
import { downloadsDir } from '@/lib/downloads';

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET     || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

/** Delete the rendered deck behind a stored downloadUrl, if it's still there. */
async function removeRenderedDeck(downloadUrl?: string) {
  if (!downloadUrl) return;
  // downloadUrl is /api/presentations/file/<name> — take the basename only,
  // so a crafted value can never walk out of the downloads directory.
  const fileName = path.basename(downloadUrl.split('?')[0]);
  if (!fileName || !fileName.endsWith('.pptx')) return;
  try {
    await fs.unlink(path.join(downloadsDir(), fileName));
  } catch {
    // Already gone (server restart, ephemeral tmp) — nothing to clean up.
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  try {
    const doc = await client.fetch(
      `*[_type == "presentation" && _id == $id && user._ref == $userId][0]{
        _id, title, downloadUrl
      }`,
      { id, userId: user.id }
    );
    if (!doc?._id) {
      return NextResponse.json({ ok: false, error: 'Presentation not found' }, { status: 404 });
    }

    await removeRenderedDeck(doc.downloadUrl);
    await deletePresentationDoc(doc._id);

    return NextResponse.json({ ok: true, title: doc.title ?? null });
  } catch (e) {
    console.error('[api/presentations/:id] DELETE error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
