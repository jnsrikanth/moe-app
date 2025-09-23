import { GoogleAuth } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/monitoring.read';

async function getClient() {
  const auth = new GoogleAuth({ scopes: [SCOPE] });
  return auth.getClient();
}

function rfc3339Date(d: Date) {
  return d.toISOString();
}

export async function getRunRequestCount5m(projectId: string, serviceName: string): Promise<number> {
  const client = await getClient();
  const end = new Date();
  const start = new Date(end.getTime() - 5 * 60 * 1000);

  const filter = [
    'metric.type="run.googleapis.com/request_count"',
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${serviceName}"`,
  ].join(' AND ');

  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`);
  url.searchParams.set('filter', filter);
  url.searchParams.set('interval.endTime', rfc3339Date(end));
  url.searchParams.set('interval.startTime', rfc3339Date(start));
  url.searchParams.set('aggregation.alignmentPeriod', '60s');
  url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_DELTA');

  const resp = await (client as any).request({ url: url.toString(), method: 'GET' });
  const series = (resp.data?.timeSeries || []) as any[];
  let sum = 0;
  for (const ts of series) {
    const points = ts.points || [];
    for (const p of points) {
      const v = p.value?.int64Value || p.value?.doubleValue || 0;
      sum += Number(v);
    }
  }
  return sum;
}
