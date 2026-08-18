import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename.endsWith('.pptx') || filename.includes('/') || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const isVercel = process.env.VERCEL === '1';
  const dirBase  = isVercel ? '/tmp' : path.join(process.cwd(), 'public');
  const filePath = path.join(dirBase, 'downloads', filename);

  try {
    const buffer = await fs.readFile(filePath);
    return new Response(buffer, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}