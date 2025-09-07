import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { type ExpertAgent, type Request, type RouterMetrics, type SystemLog, type SystemMetrics } from '../shared/schema.js';
import { type IStorage, type RouterConfig, type AgentRegistryEntry, type DatasetMeta, type AgentHealth } from './storage.js';

// Helper utils
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function nowIso() { return new Date().toISOString(); }

export class SqliteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const file = dbPath || path.resolve(process.cwd(), 'data', 'moe.db');
    ensureDir(path.dirname(file));
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    const db = this.db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS expert_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        parameters TEXT,
        cpu_usage INTEGER,
        memory_usage TEXT,
        tokens_per_minute INTEGER,
        queue_length INTEGER,
        instance_count INTEGER,
        load_threshold INTEGER,
        response_time REAL,
        is_scaling INTEGER
      );

      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        processing_time INTEGER,
        assigned_agents TEXT
      );

      CREATE TABLE IF NOT EXISTS system_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT,
        source TEXT
      );

      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        throughput REAL,
        avg_response_time REAL,
        success_rate REAL,
        error_rate REAL,
        requests_per_minute REAL
      );

      CREATE TABLE IF NOT EXISTS router_metrics (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        context_size TEXT,
        response_threshold TEXT,
        load_balancing INTEGER,
        routing_algorithm TEXT,
        cpu_usage REAL,
        memory_usage TEXT,
        tokens_per_minute REAL,
        queue_depth REAL,
        active_requests REAL,
        avg_response_time REAL
      );

      CREATE TABLE IF NOT EXISTS router_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        engine TEXT,
        model_loaded INTEGER,
        model_version TEXT,
        latency_p50_ms REAL,
        latency_p95_ms REAL,
        cost_estimate_per_decision REAL
      );

      CREATE TABLE IF NOT EXISTS agent_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capabilities TEXT,
        type TEXT,
        model TEXT,
        routing_hints TEXT,
        last_seen INTEGER,
        health TEXT
      );

      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT,
        records INTEGER,
        size_bytes INTEGER,
        created_at TEXT NOT NULL
      );
    `);

    // Seed singletons if missing
    db.prepare('INSERT OR IGNORE INTO system_metrics (id, throughput, avg_response_time, success_rate, error_rate, requests_per_minute) VALUES (1, 0, 0, 100, 0, 0)').run();
    db.prepare("INSERT OR IGNORE INTO router_config (id, engine, model_loaded) VALUES (1, ?, 0)").run((process.env.ROUTER_ENGINE || 'llm'));
    db.prepare("INSERT OR IGNORE INTO router_metrics (id, context_size, response_threshold, load_balancing, routing_algorithm, cpu_usage, memory_usage, tokens_per_minute, queue_depth, active_requests, avg_response_time) VALUES (1, '128K tokens', '5.0s', 1, 'Weighted Round-Robin', 0, '0GB', 0, 0, 0, 0)").run();

    // Seed default expert agents if empty (mirror MemStorage defaults)
    const count: { c: number } = db.prepare('SELECT COUNT(1) as c FROM expert_agents').get() as any;
    if (!count || count.c === 0) {
      const defaults = [
        {
          id: 'credit-agent', name: 'Credit Check Agent', type: 'credit', status: 'idle', model: 'Groq Llama 3.1 70B', parameters: '70B',
          cpu_usage: 15, memory_usage: '2.8GB', tokens_per_minute: 890, queue_length: 0, instance_count: 1, load_threshold: 70, response_time: 1.2, is_scaling: 0,
        },
        {
          id: 'fraud-agent', name: 'Fraud Detection Agent', type: 'fraud', status: 'idle', model: 'Groq Mixtral 8x7B', parameters: '8x7B',
          cpu_usage: 12, memory_usage: '2.1GB', tokens_per_minute: 670, queue_length: 0, instance_count: 1, load_threshold: 80, response_time: 1.8, is_scaling: 0,
        },
        {
          id: 'esg-agent', name: 'ESG Analysis Agent', type: 'esg', status: 'idle', model: 'Groq Llama 3.1 70B', parameters: '70B',
          cpu_usage: 10, memory_usage: '2.3GB', tokens_per_minute: 540, queue_length: 0, instance_count: 1, load_threshold: 60, response_time: 2.1, is_scaling: 0,
        },
      ];
      const stmt = db.prepare('INSERT OR REPLACE INTO expert_agents (id, name, type, status, model, parameters, cpu_usage, memory_usage, tokens_per_minute, queue_length, instance_count, load_threshold, response_time, is_scaling) VALUES (@id, @name, @type, @status, @model, @parameters, @cpu_usage, @memory_usage, @tokens_per_minute, @queue_length, @instance_count, @load_threshold, @response_time, @is_scaling)');
      const regStmt = db.prepare('INSERT OR REPLACE INTO agent_registry (id, name, capabilities, type, model, routing_hints, last_seen, health) VALUES (@id, @name, @capabilities, @type, @model, @routing_hints, @last_seen, @health)');
      const now = Date.now();
      for (const d of defaults) {
        stmt.run(d as any);
        regStmt.run({ id: d.id, name: d.name, capabilities: JSON.stringify([d.type]), type: d.type, model: d.model, routing_hints: JSON.stringify([]), last_seen: now, health: 'healthy' });
      }
    }
  }

  // Expert Agents
  async getExpertAgents(): Promise<ExpertAgent[]> {
    const rows = this.db.prepare('SELECT * FROM expert_agents').all();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      model: r.model,
      parameters: r.parameters,
      cpuUsage: r.cpu_usage,
      memoryUsage: r.memory_usage,
      tokensPerMinute: r.tokens_per_minute,
      queueLength: r.queue_length,
      instanceCount: r.instance_count,
      loadThreshold: r.load_threshold,
      responseTime: r.response_time,
      isScaling: !!r.is_scaling,
    }));
  }

  async updateExpertAgent(id: string, updates: Partial<ExpertAgent>): Promise<ExpertAgent> {
    let current = this.db.prepare('SELECT * FROM expert_agents WHERE id = ?').get(id);
    if (!current) {
      // Try to initialize from agent_registry
      const reg: any = this.db.prepare('SELECT * FROM agent_registry WHERE id = ?').get(id);
      const type = reg?.type || (id?.split('-')[0] || 'generic');
      const seed: ExpertAgent = {
        id,
        name: reg?.name || id,
        type,
        status: 'idle',
        model: reg?.model || '',
        parameters: '',
        cpuUsage: 0,
        memoryUsage: '0GB',
        tokensPerMinute: 0,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 70,
        responseTime: 0,
        isScaling: false,
      } as ExpertAgent;
      this.upsertExpert(seed);
      current = this.db.prepare('SELECT * FROM expert_agents WHERE id = ?').get(id);
    }
    const merged: ExpertAgent = { ...this.rowToExpert(current), ...updates } as ExpertAgent;
    this.upsertExpert(merged);
    return merged;
  }

  private rowToExpert(r: any): ExpertAgent {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      model: r.model,
      parameters: r.parameters,
      cpuUsage: r.cpu_usage,
      memoryUsage: r.memory_usage,
      tokensPerMinute: r.tokens_per_minute,
      queueLength: r.queue_length,
      instanceCount: r.instance_count,
      loadThreshold: r.load_threshold,
      responseTime: r.response_time,
      isScaling: !!r.is_scaling,
    };
  }

  private upsertExpert(a: ExpertAgent) {
    this.db.prepare(`
      INSERT INTO expert_agents (id, name, type, status, model, parameters, cpu_usage, memory_usage, tokens_per_minute, queue_length, instance_count, load_threshold, response_time, is_scaling)
      VALUES (@id, @name, @type, @status, @model, @parameters, @cpuUsage, @memoryUsage, @tokensPerMinute, @queueLength, @instanceCount, @loadThreshold, @responseTime, @isScaling)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        status=excluded.status,
        model=excluded.model,
        parameters=excluded.parameters,
        cpu_usage=excluded.cpu_usage,
        memory_usage=excluded.memory_usage,
        tokens_per_minute=excluded.tokens_per_minute,
        queue_length=excluded.queue_length,
        instance_count=excluded.instance_count,
        load_threshold=excluded.load_threshold,
        response_time=excluded.response_time,
        is_scaling=excluded.is_scaling
    `).run({ ...a, isScaling: a.isScaling ? 1 : 0 });
  }

  // Requests
  async getRequests(): Promise<Request[]> {
    const rows = this.db.prepare('SELECT * FROM requests ORDER BY datetime(timestamp) DESC').all();
    return rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      status: r.status,
      timestamp: r.timestamp,
      processingTime: r.processing_time ?? undefined,
      assignedAgents: r.assigned_agents ? JSON.parse(r.assigned_agents) : [],
    }));
  }

  async addRequest(request: Request): Promise<Request> {
    this.db.prepare(`
      INSERT INTO requests (id, type, priority, status, timestamp, processing_time, assigned_agents)
      VALUES (@id, @type, @priority, @status, @timestamp, @processingTime, @assignedAgents)
    `).run({ ...request, processingTime: request.processingTime ?? null, assignedAgents: JSON.stringify(request.assignedAgents || []) });
    return request;
  }

  async updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
    const current: any = this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
    if (!current) throw new Error(`Request with id ${id} not found`);
    const merged: Request = {
      id: current.id,
      type: updates.type ?? current.type,
      priority: updates.priority ?? current.priority,
      status: updates.status ?? current.status,
      timestamp: updates.timestamp ?? current.timestamp,
      processingTime: updates.processingTime ?? current.processing_time ?? undefined,
      assignedAgents: updates.assignedAgents ?? (current.assigned_agents ? JSON.parse(current.assigned_agents) : []),
    };
    this.db.prepare(`
      INSERT INTO requests (id, type, priority, status, timestamp, processing_time, assigned_agents)
      VALUES (@id, @type, @priority, @status, @timestamp, @processingTime, @assignedAgents)
      ON CONFLICT(id) DO UPDATE SET
        type=excluded.type,
        priority=excluded.priority,
        status=excluded.status,
        timestamp=excluded.timestamp,
        processing_time=excluded.processing_time,
        assigned_agents=excluded.assigned_agents
    `).run({ ...merged, processingTime: merged.processingTime ?? null, assignedAgents: JSON.stringify(merged.assignedAgents || []) });
    return merged;
  }

  // Router Metrics
  async getRouterMetrics(): Promise<RouterMetrics> {
    const r: any = this.db.prepare('SELECT * FROM router_metrics WHERE id = 1').get();
    return {
      contextSize: r.context_size,
      responseThreshold: r.response_threshold,
      loadBalancing: !!r.load_balancing,
      routingAlgorithm: r.routing_algorithm,
      cpuUsage: Number(r.cpu_usage || 0),
      memoryUsage: r.memory_usage,
      tokensPerMinute: Number(r.tokens_per_minute || 0),
      queueDepth: Number(r.queue_depth || 0),
      activeRequests: Number(r.active_requests || 0),
      avgResponseTime: Number(r.avg_response_time || 0),
    };
  }

  async updateRouterMetrics(updates: Partial<RouterMetrics>): Promise<RouterMetrics> {
    const current = await this.getRouterMetrics();
    const merged = { ...current, ...updates } as RouterMetrics;
    this.db.prepare(`
      INSERT INTO router_metrics (id, context_size, response_threshold, load_balancing, routing_algorithm, cpu_usage, memory_usage, tokens_per_minute, queue_depth, active_requests, avg_response_time)
      VALUES (1, @contextSize, @responseThreshold, @loadBalancing, @routingAlgorithm, @cpuUsage, @memoryUsage, @tokensPerMinute, @queueDepth, @activeRequests, @avgResponseTime)
      ON CONFLICT(id) DO UPDATE SET
        context_size=excluded.context_size,
        response_threshold=excluded.response_threshold,
        load_balancing=excluded.load_balancing,
        routing_algorithm=excluded.routing_algorithm,
        cpu_usage=excluded.cpu_usage,
        memory_usage=excluded.memory_usage,
        tokens_per_minute=excluded.tokens_per_minute,
        queue_depth=excluded.queue_depth,
        active_requests=excluded.active_requests,
        avg_response_time=excluded.avg_response_time
    `).run({ ...merged, loadBalancing: merged.loadBalancing ? 1 : 0 });
    return merged;
  }

  // System Logs
  async getSystemLogs(): Promise<SystemLog[]> {
    const rows = this.db.prepare('SELECT * FROM system_logs ORDER BY datetime(timestamp) ASC').all();
    return rows.map((r: any) => ({ id: r.id, timestamp: r.timestamp, level: r.level, message: r.message, source: r.source }));
  }

  async addSystemLog(log: SystemLog): Promise<SystemLog> {
    this.db.prepare('INSERT OR REPLACE INTO system_logs (id, timestamp, level, message, source) VALUES (@id, @timestamp, @level, @message, @source)').run(log);
    return log;
  }

  // System Metrics
  async getSystemMetrics(): Promise<SystemMetrics> {
    const r: any = this.db.prepare('SELECT * FROM system_metrics WHERE id = 1').get();
    return {
      throughput: Number(r?.throughput || 0),
      avgResponseTime: Number(r?.avg_response_time || 0),
      successRate: Number(r?.success_rate || 100),
      errorRate: Number(r?.error_rate || 0),
      requestsPerMinute: Number(r?.requests_per_minute || 0),
    };
  }

  async updateSystemMetrics(updates: Partial<SystemMetrics>): Promise<SystemMetrics> {
    const current = await this.getSystemMetrics();
    const merged = { ...current, ...updates } as SystemMetrics;
    this.db.prepare(`
      INSERT INTO system_metrics (id, throughput, avg_response_time, success_rate, error_rate, requests_per_minute)
      VALUES (1, @throughput, @avgResponseTime, @successRate, @errorRate, @requestsPerMinute)
      ON CONFLICT(id) DO UPDATE SET
        throughput=excluded.throughput,
        avg_response_time=excluded.avg_response_time,
        success_rate=excluded.success_rate,
        error_rate=excluded.error_rate,
        requests_per_minute=excluded.requests_per_minute
    `).run(merged as any);
    return merged;
  }

  // Router Config
  async getRouterConfig(): Promise<RouterConfig> {
    const r: any = this.db.prepare('SELECT * FROM router_config WHERE id = 1').get();
    const envEngine = (process.env.ROUTER_ENGINE as RouterConfig['engine']) || r?.engine || 'llm';
    return {
      engine: envEngine,
      modelLoaded: !!r?.model_loaded,
      modelVersion: r?.model_version || undefined,
      latencyP50Ms: r?.latency_p50_ms ?? undefined,
      latencyP95Ms: r?.latency_p95_ms ?? undefined,
      costEstimatePerDecision: r?.cost_estimate_per_decision ?? undefined,
    };
  }

  async setRouterConfig(updates: Partial<RouterConfig>): Promise<RouterConfig> {
    const current = await this.getRouterConfig();
    const merged = { ...current, ...updates } as RouterConfig;
    if (updates.engine) process.env.ROUTER_ENGINE = updates.engine;
    this.db.prepare(`
      INSERT INTO router_config (id, engine, model_loaded, model_version, latency_p50_ms, latency_p95_ms, cost_estimate_per_decision)
      VALUES (1, @engine, @modelLoaded, @modelVersion, @latencyP50Ms, @latencyP95Ms, @costEstimatePerDecision)
      ON CONFLICT(id) DO UPDATE SET
        engine=excluded.engine,
        model_loaded=excluded.model_loaded,
        model_version=excluded.model_version,
        latency_p50_ms=excluded.latency_p50_ms,
        latency_p95_ms=excluded.latency_p95_ms,
        cost_estimate_per_decision=excluded.cost_estimate_per_decision
    `).run({
      engine: merged.engine,
      modelLoaded: merged.modelLoaded ? 1 : 0,
      modelVersion: merged.modelVersion ?? null,
      latencyP50Ms: merged.latencyP50Ms ?? null,
      latencyP95Ms: merged.latencyP95Ms ?? null,
      costEstimatePerDecision: merged.costEstimatePerDecision ?? null,
    });
    return merged;
  }

  // Agent Registry
  async registerAgent(agent: AgentRegistryEntry): Promise<AgentRegistryEntry> {
    const entry: AgentRegistryEntry = {
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities || [],
      type: agent.type,
      model: agent.model,
      routingHints: agent.routingHints,
      lastSeen: Date.now(),
      health: 'healthy',
    };
    this.db.prepare(`
      INSERT INTO agent_registry (id, name, capabilities, type, model, routing_hints, last_seen, health)
      VALUES (@id, @name, @capabilities, @type, @model, @routingHints, @lastSeen, @health)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        capabilities=excluded.capabilities,
        type=excluded.type,
        model=excluded.model,
        routing_hints=excluded.routing_hints,
        last_seen=excluded.last_seen,
        health=excluded.health
    `).run({
      ...entry,
      capabilities: JSON.stringify(entry.capabilities || []),
      routingHints: JSON.stringify(entry.routingHints || []),
    });
    return entry;
  }

  async heartbeatAgent(id: string, meta?: Partial<AgentRegistryEntry>): Promise<AgentRegistryEntry | null> {
    const existing: any = this.db.prepare('SELECT * FROM agent_registry WHERE id = ?').get(id);
    if (!existing) return null;
    const updated: AgentRegistryEntry = {
      id: existing.id,
      name: meta?.name ?? existing.name,
      capabilities: meta?.capabilities ?? (existing.capabilities ? JSON.parse(existing.capabilities) : []),
      type: meta?.type ?? existing.type,
      model: meta?.model ?? existing.model,
      routingHints: meta?.routingHints ?? (existing.routing_hints ? JSON.parse(existing.routing_hints) : []),
      lastSeen: Date.now(),
      health: 'healthy',
    };
    await this.registerAgent(updated);
    return updated;
  }

  async getAgentRegistry(): Promise<AgentRegistryEntry[]> {
    const now = Date.now();
    const ttlSec = Number.parseInt(process.env.REGISTRY_TTL_SEC || '30', 10);
    const ttlMs = Math.max(1, ttlSec) * 1000;
    const rows = this.db.prepare('SELECT * FROM agent_registry').all();
    const entries = rows.map((r: any) => {
      const lastSeen = Number(r.last_seen || 0);
      const healthy = now - lastSeen < ttlMs;
      const e: AgentRegistryEntry = {
        id: r.id,
        name: r.name,
        capabilities: r.capabilities ? JSON.parse(r.capabilities) : [],
        type: r.type || undefined,
        model: r.model || undefined,
        routingHints: r.routing_hints ? JSON.parse(r.routing_hints) : undefined,
        lastSeen,
        health: (healthy ? 'healthy' : 'unhealthy') as AgentHealth,
      };
      // Persist updated health
      this.db.prepare('UPDATE agent_registry SET health = ? WHERE id = ?').run(e.health, e.id);
      return e;
    });
    return entries;
  }

  async removeAgent(id: string): Promise<boolean> {
    const res = this.db.prepare('DELETE FROM agent_registry WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // Datasets
  async listDatasets(): Promise<DatasetMeta[]> {
    const rows = this.db.prepare('SELECT * FROM datasets ORDER BY datetime(created_at) DESC').all();
    return rows.map((r: any) => ({ id: r.id, name: r.name, source: r.source, url: r.url || undefined, records: r.records || undefined, sizeBytes: r.size_bytes || undefined, createdAt: r.created_at }));
  }

  async registerDataset(meta: Omit<DatasetMeta, 'id' | 'createdAt'> & { id?: string }): Promise<DatasetMeta> {
    const id = meta.id || `ds_${Date.now()}`;
    const entry: DatasetMeta = { id, name: meta.name, source: meta.source, url: meta.url, records: meta.records, sizeBytes: meta.sizeBytes, createdAt: nowIso() };
    this.db.prepare('INSERT OR REPLACE INTO datasets (id, name, source, url, records, size_bytes, created_at) VALUES (@id, @name, @source, @url, @records, @sizeBytes, @createdAt)').run(entry as any);
    return entry;
  }

  async removeDataset(id: string): Promise<boolean> {
    const res = this.db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
    return res.changes > 0;
  }
}
