import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = process.env.ORCHESTRATOR_URL;
  const key = process.env.ORCHESTRATOR_API_KEY || '';
  if (!url) return NextResponse.json({ error: 'ORCHESTRATOR_URL not configured' }, { status: 500 });
  const u = new URL(req.url);
  const params = u.search ? u.search : '';
  const resp = await fetch(`${url.replace(/\/$/, '')}/cost${params}`, { headers: { 'x-api-key': key } });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}

