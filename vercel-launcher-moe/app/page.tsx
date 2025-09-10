"use client";
import { useState } from 'react';

type InvItem = { id: string; name: string; location?: string; url?: string; kind: string; status: 'ACTIVE'|'INACTIVE'|'UNKNOWN'; details?: Record<string, any> };

export default function Home() {
  const [launching, setLaunching] = useState(false);
  const [overall, setOverall] = useState<'ACTIVE'|'INACTIVE'|null>(null);
  const [items, setItems] = useState<InvItem[]>([]);
  const [costRows, setCostRows] = useState<{ period: string; service: string; cost_usd: number }[]>([]);
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

  async function refresh() {
    try {
      const [res, cost] = await Promise.all([
        fetch('/api/resources', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/cost?granularity=month', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setOverall(res?.overallStatus || null);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setCostRows(Array.isArray(cost?.rows) ? cost.rows : []);
    } catch (e) {
      // ignore
    }
  }

  // Load on mount
  if (overall === null && typeof window !== 'undefined') {
    // lightweight trigger
    void refresh();
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1220', color: '#fff' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, padding: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Prime Rose — MOE On‑Demand</h1>
        <p style={{ opacity: 0.8, marginBottom: 20 }}>Ethereal Blends</p>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 600 }}>Overall Status: </span>
          {overall === 'ACTIVE' ? (
            <span style={{ color: '#22c55e' }}>Online</span>
          ) : overall === 'INACTIVE' ? (
            <span style={{ color: '#ef4444' }}>Offline</span>
          ) : (
            <span style={{ opacity: 0.7 }}>Loading…</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {(overall === 'ACTIVE') ? (
            <button onClick={async () => {
              setLaunching(true);
              setError(null);
              try {
                const res = await fetch('/api/stop', { method: 'POST' });
                if (!res.ok) throw new Error(`Stop failed: ${res.status}`);
                await refresh();
              } catch (e: any) { setError(e?.message || 'Stop failed'); }
              finally { setLaunching(false); }
            }} disabled={launching} style={{ padding: '10px 14px', fontWeight: 600, background: '#374151', color: '#fff', border: 'none', borderRadius: 8 }}>Stop</button>
          ) : (
            <button onClick={start} disabled={launching} style={{ padding: '10px 14px', fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8 }}>
              {launching ? 'Starting…' : 'Start'}
            </button>
          )}
          <button onClick={refresh} style={{ padding: '10px 14px', fontWeight: 600, background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: 8 }}>Refresh</button>
        </div>

        {error && <p style={{ color: '#f87171', marginTop: 12 }}>{error}</p>}

        {/* Resources table */}
        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <h2 style={{ marginBottom: 8, fontSize: 18 }}>Resources (moe-app project)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Status</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Kind</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Name</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Location</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id || idx}>
                    <td style={{ padding: 8 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: it.status === 'ACTIVE' ? '#22c55e' : it.status === 'INACTIVE' ? '#ef4444' : '#9ca3af' }} />
                    </td>
                    <td style={{ padding: 8, textTransform: 'uppercase', fontSize: 12, opacity: 0.8 }}>{it.kind}</td>
                    <td style={{ padding: 8 }}>
                      {it.url ? <a href={it.url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>{it.name}</a> : it.name}
                    </td>
                    <td style={{ padding: 8 }}>{it.location || '—'}</td>
                    <td style={{ padding: 8, fontSize: 12, opacity: 0.8 }}>{it.details ? JSON.stringify(it.details) : '—'}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 8, opacity: 0.7 }}>No resources found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost table */}
        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <h2 style={{ marginBottom: 8, fontSize: 18 }}>Costs (Monthly, since inception)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Period</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'left' }}>Service</th>
                  <th style={{ borderBottom: '1px solid #374151', padding: 8, textAlign: 'right' }}>Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: 8 }}>{r.period}</td>
                    <td style={{ padding: 8 }}>{r.service}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>${r.cost_usd.toFixed(2)}</td>
                  </tr>
                ))}
                {costRows.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: 8, opacity: 0.7 }}>No billing export configured or no data.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
