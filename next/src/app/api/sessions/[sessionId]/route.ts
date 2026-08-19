import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import { getCurrentUser } from '@/lib/auth';
import { deleteChatSession } from '@/lib/sanity';

const client = createClient({
  projectId:  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  dataset:    process.env.NEXT_PUBLIC_SANITY_DATASET     || 'production',
  useCdn:     false,
  apiVersion: '2024-01-01',
  token:      process.env.SANITY_API_TOKEN,
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ messages: [], error: 'Not signed in' }, { status: 401 });
  }

  try {
    const session = await client.fetch(
      `*[_type == "chatSession" && sessionId == $sessionId && user._ref == $userId][0]{
        messages[]{
          messageId, role, content, timestamp,
          showPresentation, presentationScope, year, quarter, contextQuarter
        }
      }`,
      { sessionId, userId: user.id }
    );
    return NextResponse.json({ messages: session?.messages ?? [] });
  } catch (e) {
    console.error('[api/sessions/:id] error:', e);
    return NextResponse.json({ messages: [], error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  try {
    // Ownership check first — deleting another user's conversation (or a
    // legacy unowned one) must be impossible, not merely unlikely.
    const owned = await client.fetch(
      `count(*[_type == "chatSession" && sessionId == $sessionId && user._ref == $userId])`,
      { sessionId, userId: user.id }
    );
    if (!owned) {
      return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
    }

    await deleteChatSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/sessions/:id] DELETE error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
