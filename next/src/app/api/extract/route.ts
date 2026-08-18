import { NextRequest, NextResponse } from 'next/server';

const AUTOGEN_URL = process.env.AUTOGEN_SERVICE_URL || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    const { quarter, year, mode = 'single' } = await request.json();

    // Step 1: get context from Python service
    const ctxRes = await fetch(`${AUTOGEN_URL}/api/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarter, year, mode }),
    });
    if (!ctxRes.ok) throw new Error(`Context agent error: ${await ctxRes.text()}`);
    const { context } = await ctxRes.json();

    // Step 2: extract intelligence
    const extRes = await fetch(`${AUTOGEN_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_payload: context }),
    });
    if (!extRes.ok) throw new Error(`Extraction agent error: ${await extRes.text()}`);
    const { intelligence } = await extRes.json();

    return NextResponse.json({ success: true, intelligence });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}