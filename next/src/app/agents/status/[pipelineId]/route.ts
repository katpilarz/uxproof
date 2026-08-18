import { NextRequest, NextResponse } from 'next/server';

const AUTOGEN_URL =
  process.env.AUTOGEN_SERVICE_URL || 'http://localhost:8001';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ pipelineId: string }> }
) {
  try {
    const { pipelineId } = await context.params;

    const r = await fetch(
      `${AUTOGEN_URL}/api/agents/status/${pipelineId}`
    );

    const data = await r.json();

    return NextResponse.json(data, {
      status: r.status,
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}