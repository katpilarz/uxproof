// app/api/files/[id]/route.ts
//
// DELETE — remove one uploaded file from the signed-in user's workspace.
//
// The `report` documents parsed out of that upload go with it, along with
// the slide plans and intelligence the pipeline derived from them. All
// research data in uxproof is upload-grounded, so anything left behind
// would keep supplying SUS scores and trends to analyses and decks with
// nothing standing behind them — and the year-scope slide plan is fetched
// by _id alone, so it would outlive its source silently. A period another
// upload still claims is left alone (orphanedPeriodsForFile) — only
// genuinely sourceless research is removed.
//
// Already-rendered presentations are NOT touched: a generated deck is a
// delivered artifact, and the user deletes those explicitly from the
// presentations dashboard.
//
// Ownership is checked against the document's user reference first, so an
// id from another account is a 404, not a deletion.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import { getCurrentUser } from '@/lib/auth';
import {
  deleteUserFileDoc,
  deleteUserReportsForPeriods,
  orphanedPeriodsForFile,
} from '@/lib/sanity';

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET     || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

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
      `*[_type == "userFile" && _id == $id && user._ref == $userId][0]{
        _id, filename, reportsCreated
      }`,
      { id, userId: user.id }
    );
    if (!doc?._id) {
      return NextResponse.json({ ok: false, error: 'File not found' }, { status: 404 });
    }

    const periods = (doc.reportsCreated ?? []).filter(Boolean) as string[];
    const orphaned = await orphanedPeriodsForFile(user.id, doc._id, periods);
    // Counts every document removed for those periods — the reports plus
    // the slide plans and intelligence derived from them.
    const documentsDeleted = await deleteUserReportsForPeriods(user.id, orphaned);

    await deleteUserFileDoc(doc._id);

    return NextResponse.json({
      ok:             true,
      filename:       doc.filename ?? null,
      periodsRemoved: orphaned,
      documentsDeleted,
    });
  } catch (e) {
    console.error('[api/files/:id] DELETE error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
