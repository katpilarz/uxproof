import { NextRequest, NextResponse } from 'next/server';

const AUTOGEN_URL =
  process.env.AUTOGEN_SERVICE_URL || 'http://localhost:8001';

// POST /agents — trigger the full agent pipeline
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const r = await fetch(`${AUTOGEN_URL}/api/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}

// GET /agents — list recent pipeline runs
export async function GET(_req: NextRequest) {
  try {
    const r = await fetch(`${AUTOGEN_URL}/api/agents/history`);
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}