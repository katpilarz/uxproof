/**
 * app/api/agents/stream/route.ts
 *
 * Next.js App Router SSE proxy.
 * Forwards the POST body to FastAPI /api/agents/run/stream and
 * pipes the Server-Sent Events back to the browser.
 *
 * The FastAPI service returns lines of the form:
 *   data: {"event":"tool_start", ...}\n\n
 */

import { NextRequest } from 'next/server';

const AUTOGEN_URL =
  process.env.AUTOGEN_SERVICE_URL || 'http://localhost:8001';

export const runtime = 'nodejs'; // SSE requires Node.js runtime, not Edge

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Forward to Python FastAPI SSE endpoint with a generous timeout
  const upstream = await fetch(`${AUTOGEN_URL}/api/agents/run/stream`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(300_000), // 5 min ceiling
  });

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Pipe the upstream body straight to the browser as an SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const reader  = upstream.body!.getReader();
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value ?? encoder.encode(''));
        }
      } catch {
        // Client disconnected — clean up silently
      } finally {
        controller.close();
        reader.cancel();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering when behind a proxy
    },
  });
}