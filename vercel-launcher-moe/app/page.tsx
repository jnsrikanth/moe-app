"use client";
import { useState } from 'react';

export default function Home() {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch('/api/start', { method: 'POST' });
      if (!res.ok) throw new Error(`Start failed: ${res.status}`);
      const startedAt = Date.now();
      while (Date.now() - startedAt < 5 * 60_000) { // up to 5 minutes
        await new Promise(r => setTimeout(r, 2500));
        const s = await fetch('/api/status', { cache: 'no-store' }).then(r => r.json());
        if (s?.ready && s?.dashboardUrl) {
          window.location.href = s.dashboardUrl as string;
          return;
        }
      }
      throw new Error('Timed out waiting for MOE to become ready');
    } catch (e: any) {
      setError(e?.message || 'Unknown error');
      setLaunching(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1220', color: '#fff' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, padding: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Prime Rose — MOE On‑Demand</h1>
        <p style={{ opacity: 0.8, marginBottom: 20 }}>Ethereal Blends</p>
        <button onClick={start} disabled={launching} style={{ padding: '12px 16px', marginTop: 16, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8 }}>
          {launching ? 'Launching…' : 'Launch MOE'}
        </button>
        {error && <p style={{ color: '#f87171', marginTop: 12 }}>{error}</p>}
      </div>
    </main>
  );
}
