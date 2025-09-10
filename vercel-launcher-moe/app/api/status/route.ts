import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.ORCHESTRATOR_URL; // base: .../api/orchestrator
  const key = process.env.ORCHESTRATOR_API_KEY || '';
  if (!url) {
    return NextResponse.json({ error: 'ORCHESTRATOR_URL not configured' }, { status: 500 });
  }
  const resp = await fetch(`${url.replace(/\/$/, '')}/status`, { headers: { 'x-api-key': key } });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
