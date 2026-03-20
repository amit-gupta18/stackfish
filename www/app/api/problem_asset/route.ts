import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProblemDir } from '../../services/problemData';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const problem = searchParams.get('problem');
  const file = searchParams.get('file');

  if (!problem || !file) {
    return NextResponse.json({ error: 'Problem and file are required' }, { status: 400 });
  }

  if (file.includes('/') || file.includes('\\')) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const assetPath = path.join(getProblemDir(problem), file);
  if (!fs.existsSync(assetPath)) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const ext = path.extname(assetPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const buffer = fs.readFileSync(assetPath);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
