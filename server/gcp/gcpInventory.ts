import { GoogleAuth } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export type InventoryItem = {
  id: string;
  name: string;
  location?: string;
  url?: string;
  kind: string; // e.g., cloudrun, compute, sql, redis, gke, pubsub, ip, storage, artifact, vertex
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  details?: Record<string, any>;
};

export type InventorySummary = {
  projectId: string;
  overallStatus: 'ACTIVE' | 'INACTIVE';
  items: InventoryItem[];
};

async function getClient() {
  const auth = new GoogleAuth({ scopes: [SCOPE] });
  return auth.getClient();
}

async function request<T = any>(url: string, init?: any): Promise<T> {
  const client = await getClient();
  const resp = await (client as any).request({ url, method: init?.method || 'GET', data: init?.body, headers: init?.headers });
  return resp.data as T;
}

export async function fetchInventory(params: { projectId: string; regions?: string[]; }): Promise<InventorySummary> {
  const { projectId } = params;
  const regions = params.regions && params.regions.length ? params.regions : ['us-central1'];
  const items: InventoryItem[] = [];

  // Cloud Run services per region
  for (const r of regions) {
    try {
      const data = await request<any>(`https://run.googleapis.com/v2/projects/${projectId}/locations/${r}/services`);
      const svcs = Array.isArray(data?.services) ? data.services : [];
      for (const s of svcs) {
        items.push({
          id: s?.name || `${projectId}-${r}-${s?.uid || 'service'}`,
          name: s?.name?.split('/').pop() || 'service',
          location: r,
          url: s?.uri,
          kind: 'cloudrun',
          status: (s?.template?.scaling?.minInstanceCount ?? 0) > 0 ? 'ACTIVE' : 'INACTIVE',
          details: {
            minInstanceCount: s?.template?.scaling?.minInstanceCount ?? 0,
            maxInstanceCount: s?.template?.scaling?.maxInstanceCount,
            ingress: s?.ingress,
          },
        });
      }
    } catch {}
  }

  // Compute Engine instances (aggregated)
  try {
    const agg = await request<any>(`https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/instances`);
    const scoped = agg?.items || {};
    for (const [zone, content] of Object.entries<any>(scoped)) {
      const instances = Array.isArray(content?.instances) ? content.instances : [];
      for (const inst of instances) {
        items.push({
          id: inst?.id?.toString() || inst?.name,
          name: inst?.name,
          location: inst?.zone?.split('/').pop(),
          kind: 'compute',
          status: inst?.status === 'RUNNING' ? 'ACTIVE' : 'INACTIVE',
          details: {
            machineType: inst?.machineType?.split('/').pop(),
            status: inst?.status,
            tags: inst?.tags,
          },
        });
      }
    }
  } catch {}

  // Cloud SQL instances
  try {
    const sql = await request<any>(`https://sqladmin.googleapis.com/sql/v1beta4/projects/${projectId}/instances`);
    const list = Array.isArray(sql?.items) ? sql.items : [];
    for (const i of list) {
      items.push({
        id: i?.name,
        name: i?.name,
        location: i?.region,
        kind: 'sql',
        status: i?.state === 'RUNNABLE' ? 'ACTIVE' : 'INACTIVE',
        details: { tier: i?.settings?.tier, availabilityType: i?.settings?.availabilityType },
      });
    }
  } catch {}

  // Memorystore Redis
  try {
    const redis = await request<any>(`https://redis.googleapis.com/v1/projects/${projectId}/locations/-/instances`);
    const list = Array.isArray(redis?.instances) ? redis.instances : [];
    for (const i of list) {
      items.push({
        id: i?.name,
        name: i?.name?.split('/').pop(),
        location: i?.locationId,
        kind: 'redis',
        status: i?.state === 'READY' ? 'ACTIVE' : 'INACTIVE',
        details: { tier: i?.tier, sizeGb: i?.memorySizeGb },
      });
    }
  } catch {}

  // GKE clusters
  try {
    const gke = await request<any>(`https://container.googleapis.com/v1/projects/${projectId}/locations/-/clusters`);
    const list = Array.isArray(gke?.clusters) ? gke.clusters : [];
    for (const c of list) {
      items.push({
        id: c?.selfLink || c?.name,
        name: c?.name,
        location: c?.location || c?.zone || c?.region,
        kind: 'gke',
        status: (c?.currentNodeCount ?? 0) > 0 ? 'ACTIVE' : 'INACTIVE',
        details: { autopilot: c?.autopilot?.enabled, nodeCount: c?.currentNodeCount },
      });
    }
  } catch {}

  // Pub/Sub topics
  try {
    const topics = await request<any>(`https://pubsub.googleapis.com/v1/projects/${projectId}/topics`);
    const list = Array.isArray(topics?.topics) ? topics.topics : [];
    for (const t of list) {
      items.push({ id: t?.name, name: t?.name?.split('/').pop(), kind: 'pubsub', status: 'ACTIVE' });
    }
  } catch {}

  // Static IPs
  try {
    const addrs = await request<any>(`https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/addresses`);
    for (const [_k, v] of Object.entries<any>(addrs?.items || {})) {
      const list = Array.isArray(v?.addresses) ? v.addresses : [];
      for (const a of list) {
        items.push({ id: a?.id?.toString() || a?.name, name: a?.name, location: a?.region?.split('/').pop(), kind: 'ip', status: a?.status === 'RESERVED' ? 'ACTIVE' : 'INACTIVE', details: { address: a?.address } });
      }
    }
  } catch {}

  // Storage buckets
  try {
    const buckets = await request<any>(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`);
    const list = Array.isArray(buckets?.items) ? buckets.items : [];
    for (const b of list) {
      items.push({ id: b?.id, name: b?.name, location: b?.location, kind: 'storage', status: 'ACTIVE' });
    }
  } catch {}

  // Artifact Registry repos
  try {
    const repos = await request<any>(`https://artifactregistry.googleapis.com/v1/projects/${projectId}/locations/-/repositories`);
    const list = Array.isArray(repos?.repositories) ? repos.repositories : [];
    for (const r of list) {
      items.push({ id: r?.name, name: r?.name?.split('/').pop(), location: r?.location, kind: 'artifact', status: 'ACTIVE', details: { format: r?.format } });
    }
  } catch {}

  // Vertex AI endpoints (in selected regions)
  for (const r of regions) {
    try {
      const eps = await request<any>(`https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${r}/endpoints`);
      const list = Array.isArray(eps?.endpoints) ? eps.endpoints : [];
      for (const e of list) {
        items.push({ id: e?.name, name: e?.displayName || e?.name?.split('/').pop(), location: r, kind: 'vertex', status: (Array.isArray(e?.deployedModels) && e.deployedModels.length > 0) ? 'ACTIVE' : 'INACTIVE' });
      }
    } catch {}
  }

  // Overall: active if any Cloud Run service has minInstanceCount > 0
  const anyActiveRun = items.some(i => i.kind === 'cloudrun' && i.details && (i.details.minInstanceCount ?? 0) > 0);
  const overallStatus: 'ACTIVE' | 'INACTIVE' = anyActiveRun ? 'ACTIVE' : 'INACTIVE';

  return { projectId, overallStatus, items };
}
