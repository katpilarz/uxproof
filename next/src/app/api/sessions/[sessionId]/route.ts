import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@sanity/client';

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

  try {
    const session = await client.fetch(
      `*[_type == "chatSession" && sessionId == $sessionId][0]{
        messages[]{
          messageId, role, content, timestamp,
          showPresentation, presentationScope, year, quarter, contextQuarter
        }
      }`,
      { sessionId }
    );
    return NextResponse.json({ messages: session?.messages ?? [] });
  } catch (e) {
    console.error('[api/sessions/:id] error:', e);
    return NextResponse.json({ messages: [], error: String(e) }, { status: 500 });
  }
}