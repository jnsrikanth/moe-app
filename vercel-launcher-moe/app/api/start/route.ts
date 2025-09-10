import { NextResponse } from 'next/server';

export async function POST() {
  const url = process.env.ORCHESTRATOR_URL; // e.g. https://moe-app-xxxx.a.run.app/api/orchestrator
  const key = process.env.ORCHESTRATOR_API_KEY || '';
  if (!url) {
    return NextResponse.json({ error: 'ORCHESTRATOR_URL not configured' }, { status: 500 });
  }
  const resp = await fetch(`${url.replace(/\/$/, '')}/start`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'vercel' }),
    // No cache
  });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
