import { NextRequest, NextResponse } from 'next/server';

const AGENT_SERVICE =
  process.env.AGENT_SERVICE_URL || 'http://localhost:8001';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ pipelineId: string }> }
) {
  try {
    const { pipelineId } = await context.params;

    const r = await fetch(
      `${AGENT_SERVICE}/api/agents/status/${pipelineId}`
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