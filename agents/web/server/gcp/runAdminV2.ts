import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export type RunServiceRef = {
  projectId: string;
  location: string;
  name: string; // Cloud Run service name
};

export type RunServiceInfo = {
  uri?: string;
  minInstanceCount?: number;
};

export class RunAdminV2 {
  // getClient() returns a Promise<AuthClient>. Store that promise directly.
  private static clientPromise: ReturnType<GoogleAuth['getClient']> | null = null;

  private static async getClient() {
    if (!this.clientPromise) {
      const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
      this.clientPromise = auth.getClient();
    }
    return this.clientPromise;
  }

  static async getService(ref: RunServiceRef): Promise<RunServiceInfo> {
    const client = await this.getClient();
    const url = `https://run.googleapis.com/v2/projects/${ref.projectId}/locations/${ref.location}/services/${ref.name}`;
    const resp = await (client as any).request({ url, method: 'GET' });
    const data = resp.data as any;
    return {
      uri: data?.uri,
      minInstanceCount: data?.template?.scaling?.minInstanceCount,
    };
  }

  static async setMinInstances(ref: RunServiceRef, minInstanceCount: number, timeoutMs = 120_000): Promise<void> {
    const client = await this.getClient();
    const url = `https://run.googleapis.com/v2/projects/${ref.projectId}/locations/${ref.location}/services/${ref.name}`;

    const body = {
      template: {
        scaling: { minInstanceCount },
      },
    };

    const query = new URLSearchParams({ updateMask: 'template.scaling.minInstanceCount' });
    const patchUrl = `${url}?${query.toString()}`;

    const op = await (client as any).request({
      url: patchUrl,
      method: 'PATCH',
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });

    const opName = (op.data as any)?.name as string | undefined;
    if (!opName) return; // nothing to poll

    // Poll LRO
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const opResp = await (client as any).request({ url: `https://run.googleapis.com/v2/${opName}`, method: 'GET' });
      const done = (opResp.data as any)?.done;
      if (done) {
        const error = (opResp.data as any)?.error;
        if (error) {
          const msg = error?.message || JSON.stringify(error);
          throw new Error(`Cloud Run update failed: ${msg}`);
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('Timed out waiting for Cloud Run service update');
  }
}
