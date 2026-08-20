// app/api/reports/route.ts
//
// GET — a light summary of what the signed-in user actually has: the
// periods their uploads produced, and how many files are behind them.
//
// This exists so the UI can stop guessing. The chat's suggestion chips
// used to be hardcoded ("Generate 2025 presentation", "Compare Q3 vs Q4
// 2025", "Generate Q1 2026 presentation") — periods from the old demo
// seed that no user necessarily owns, which offered people a one-click
// route to a guaranteed "no research data" error. Suggestions are built
// from this instead.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { fetchUserPeriods } from '@/lib/services/report-query';
import { countUserFiles } from '@/lib/sanity';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ periods: [], fileCount: 0, error: 'Not signed in' }, { status: 401 });
  }
  try {
    const [periods, fileCount] = await Promise.all([
      fetchUserPeriods(user.id),
      countUserFiles(user.id),
    ]);
    return NextResponse.json({ periods, fileCount });
  } catch (e) {
    console.error('[api/reports] GET error:', e);
    return NextResponse.json({ periods: [], fileCount: 0, error: String(e) }, { status: 500 });
  }
}
