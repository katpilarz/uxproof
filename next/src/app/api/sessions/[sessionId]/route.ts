import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@sanity/client';
import { getCurrentUser } from '@/lib/auth';
import { deleteChatSession, renameChatSession } from '@/lib/sanity';

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

const MAX_TITLE_LENGTH = 120;

/**
 * Does this conversation exist AND belong to the signed-in user? Every
 * mutation below asks first — acting on another user's conversation (or a
 * legacy unowned one) must be impossible, not merely unlikely.
 */
async function ownsSession(sessionId: string, userId: string): Promise<boolean> {
  const count = await client.fetch(
    `count(*[_type == "chatSession" && sessionId == $sessionId && user._ref == $userId])`,
    { sessionId, userId }
  );
  return !!count;
}

/** PATCH { title } — rename the conversation. An empty title clears it. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  try {
    const body  = await req.json().catch(() => ({}));
    const title = String(body?.title ?? '').trim().replace(/\s+/g, ' ');

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Titles must be ${MAX_TITLE_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    if (!(await ownsSession(sessionId, user.id))) {
      return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
    }

    await renameChatSession(sessionId, title);
    return NextResponse.json({ ok: true, title: title || null });
  } catch (e) {
    console.error('[api/sessions/:id] PATCH error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
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
    if (!(await ownsSession(sessionId, user.id))) {
      return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
    }

    await deleteChatSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/sessions/:id] DELETE error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
