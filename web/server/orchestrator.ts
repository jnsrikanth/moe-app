import 'dotenv/config';
import express from 'express';

// Reuse helpers from the main server
import { RunAdminV2 } from './gcp/runAdminV2';

const app = express();
app.use(express.json());

function requireApiKey(req: any, res: any, next: any) {
  const key = process.env.ORCH_API_KEY;
  if (!key) return next(); // allow if not set (dev)
  const provided = req.headers['x-api-key'] || req.headers['x-orchestrator-key'];
  if (provided && String(provided) === String(key)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const ORCH_PROJECT_ID = process.env.ORCH_PROJECT_ID || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const ORCH_LOCATION = process.env.ORCH_LOCATION || process.env.GCP_LOCATION || 'us-central1';
const ORCH_SERVICES = (process.env.ORCH_SERVICES || 'moe-app,credit-agent')
  .split(',').map(s => s.trim()).filter(Boolean);

async function listRunRefs() {
  const projectId = ORCH_PROJECT_ID;
  const location = ORCH_LOCATION;
  return ORCH_SERVICES.map((name) => ({ projectId, location, name }));
}

app.post('/api/orchestrator/start', requireApiKey, async (_req, res) => {
  try {
    if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
    const refs = await listRunRefs();
    for (const ref of refs) {
      await RunAdminV2.setMinInstances(ref, 1);
    }
    res.json({ ok: true, services: ORCH_SERVICES });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to start MOE' });
  }
});

app.post('/api/orchestrator/stop', requireApiKey, async (_req, res) => {
  try {
    if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
    const refs = await listRunRefs();
    for (const ref of refs) {
      await RunAdminV2.setMinInstances(ref, 0);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to stop MOE' });
  }
});

app.get('/api/orchestrator/status', requireApiKey, async (_req, res) => {
  try {
    if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
    const refs = await listRunRefs();
    // Primary service is the first one
    const primary = refs[0];
    const info = await RunAdminV2.getService(primary);
    const ready = (info?.minInstanceCount ?? 0) > 0;
    res.json({ ready, minInstanceCount: info?.minInstanceCount ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to get status' });
  }
});

app.get('/api/orchestrator/resources', requireApiKey, async (_req, res) => {
  try {
    if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
    const regions = (process.env.ORCH_REGIONS || ORCH_LOCATION || 'us-central1').split(',').map(s=>s.trim()).filter(Boolean);
    const { fetchInventory } = await import('./gcp/gcpInventory');
    const inv = await fetchInventory({ projectId: ORCH_PROJECT_ID, regions });
    res.json(inv);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to get resources' });
  }
});

app.get('/api/orchestrator/cost', requireApiKey, async (req, res) => {
  try {
    if (!ORCH_PROJECT_ID) return res.status(500).json({ error: 'ORCH_PROJECT_ID not set' });
    const BILLING_PROJECT_ID = process.env.BILLING_PROJECT_ID || process.env.BILLING_EXPORT_PROJECT_ID;
    const BILLING_DATASET = process.env.BILLING_DATASET || process.env.BILLING_EXPORT_DATASET;
    const BILLING_TABLE = process.env.BILLING_TABLE || process.env.BILLING_EXPORT_TABLE;
    if (!BILLING_PROJECT_ID || !BILLING_DATASET || !BILLING_TABLE) {
      return res.status(200).json({ configured: false, message: 'Billing export not configured', rows: [] });
    }
    const gran = (String((req.query as any).granularity || 'all').toLowerCase() as any);
    const start = (req.query as any).start ? String((req.query as any).start) : undefined;
    const end = (req.query as any).end ? String((req.query as any).end) : undefined;
    const { fetchCosts } = await import('./gcp/billing');
    const out = await fetchCosts({
      billingProjectId: BILLING_PROJECT_ID,
      dataset: BILLING_DATASET,
      table: BILLING_TABLE,
      projectIdFilter: ORCH_PROJECT_ID,
      granularity: gran,
      start,
      end,
    });
    res.json({ configured: true, ...out });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to get cost data' });
  }
});

const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`[orchestrator] listening on :${port}`);
});
