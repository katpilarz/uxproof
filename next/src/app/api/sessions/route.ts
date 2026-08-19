import { NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import { getCurrentUser } from '@/lib/auth';

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET     || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,   // server-side: works
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ sessions: [], error: 'Not signed in' }, { status: 401 });
  }

  try {
    const rows = await client.fetch(
      `*[_type == "chatSession" && user._ref == $userId] | order(createdAt desc)[0..49]{
        "sessionId":    sessionId,
        "id":           sessionId,
        "title":        coalesce(quarter, sessionId),
        quarter,
        createdAt,
        "preview":      messages[-1].content,
        "messageCount": count(messages)
      }`,
      { userId: user.id }
    );
    return NextResponse.json({ sessions: (rows || []).filter((r: any) => r.sessionId) });
  } catch (e) {
    console.error('[api/sessions] error:', e);
    return NextResponse.json({ sessions: [], error: String(e) }, { status: 500 });
  }
}
