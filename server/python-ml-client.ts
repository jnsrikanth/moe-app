import { setTimeout as delay } from 'timers/promises';

const DEFAULT_URL = process.env.PY_LOCAL_URL || `http://${process.env.PY_LOCAL_HOST || '127.0.0.1'}:${process.env.PY_LOCAL_PORT || '5055'}`;
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PY_LOCAL_TIMEOUT_MS || '2000', 10);

async function withTimeout<T>(p: Promise<T>, ms = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // @ts-expect-error node18+ fetch supports signal
    const result = await p;
    return result as T;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(path: string, body: any, timeoutMs?: number): Promise<any> {
  const url = `${DEFAULT_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal as any,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function routeRequest(request: any): Promise<{ selected_agents: string[]; reasoning?: string } | null> {
  try {
    const res = await postJson('/v1/router/route', request);
    if (Array.isArray(res?.selected_agents)) return { selected_agents: res.selected_agents, reasoning: res.reasoning };
    return null;
  } catch {
    return null;
  }
}

export async function analyzeCredit(request: any): Promise<any | null> {
  try { return await postJson('/v1/credit/analyze', { request }); } catch { return null; }
}
export async function analyzeFraud(request: any): Promise<any | null> {
  try { return await postJson('/v1/fraud/analyze', { request }); } catch { return null; }
}
export async function analyzeESG(request: any): Promise<any | null> {
  try { return await postJson('/v1/esg/analyze', { request }); } catch { return null; }
}
