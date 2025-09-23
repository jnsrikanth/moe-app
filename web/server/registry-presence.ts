import Redis from 'ioredis';

export type PresencePayload = {
  id: string;
  name?: string;
  type?: string;
  capabilities?: string[];
  model?: string;
  routingHints?: string[];
};

class NoopPresence {
  enabled = false;
  async heartbeat(_payload: PresencePayload, _ttlSec = 30): Promise<void> {}
  async syncActiveIds(): Promise<string[]> { return []; }
}

class RedisPresenceImpl {
  enabled = true;
  private client: Redis;
  private prefix: string;

  constructor(url: string, prefix = 'agent') {
    this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    this.prefix = prefix;
    // Fire-and-forget connect
    void this.client.connect().catch(() => {});
  }

  private key(id: string) { return `${this.prefix}:${id}`; }

  async heartbeat(payload: PresencePayload, ttlSec = 30): Promise<void> {
    try {
      const k = this.key(payload.id);
      await this.client.set(k, JSON.stringify({ ...payload, ts: Date.now() }), 'EX', ttlSec);
    } catch {}
  }

  async syncActiveIds(): Promise<string[]> {
    try {
      const stream = this.client.scanStream({ match: `${this.prefix}:*`, count: 100 });
      const ids: string[] = [];
      for await (const keys of stream as any) {
        for (const k of keys as string[]) {
          const id = k.split(':', 2)[1];
          if (id) ids.push(id);
        }
      }
      return ids;
    } catch {
      return [];
    }
  }
}

export const presence = (() => {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL; // ioredis requires redis:// or rediss://
  if (!url) return new NoopPresence();
  return new RedisPresenceImpl(url);
})();
