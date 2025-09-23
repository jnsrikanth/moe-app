import { GoogleAuth, IdTokenClient } from 'google-auth-library';

let clientCache: Record<string, IdTokenClient> = {};

export async function postWithIdToken(url: string, payload: unknown): Promise<{ status: number; data: any; }> {
  const aud = url; // Cloud Run URL as audience
  if (!clientCache[aud]) {
    const auth = new GoogleAuth();
    clientCache[aud] = await auth.getIdTokenClient(aud);
  }
  const client = clientCache[aud];
  const resp = await client.request({
    url,
    method: 'POST',
    data: payload as any,
    headers: { 'Content-Type': 'application/json' },
  });
  return { status: resp.status || 200, data: resp.data };
}
