import { type ExpertAgent, type Request, type RouterMetrics, type SystemLog, type SystemMetrics } from "../shared/schema.js";
import { SqliteStorage } from './sqlite-storage.js';

export interface DatasetMeta {
  id: string;
  name: string;
  source: 'url' | 'inline' | 'upload';
  url?: string;
  records?: number;
  sizeBytes?: number;
  createdAt: string;
}

export interface IStorage {
  getExpertAgents(): Promise<ExpertAgent[]>;
  updateExpertAgent(id: string, updates: Partial<ExpertAgent>): Promise<ExpertAgent>;
  getRequests(): Promise<Request[]>;
  addRequest(request: Request): Promise<Request>;
  updateRequest(id: string, updates: Partial<Request>): Promise<Request>;
  getRouterMetrics(): Promise<RouterMetrics>;
  updateRouterMetrics(updates: Partial<RouterMetrics>): Promise<RouterMetrics>;
  getSystemLogs(): Promise<SystemLog[]>;
  addSystemLog(log: SystemLog): Promise<SystemLog>;
  getSystemMetrics(): Promise<SystemMetrics>;
  updateSystemMetrics(updates: Partial<SystemMetrics>): Promise<SystemMetrics>;
  getRouterConfig(): Promise<RouterConfig>;
  setRouterConfig(updates: Partial<RouterConfig>): Promise<RouterConfig>;
  // Agent Registry
  registerAgent(agent: AgentRegistryEntry): Promise<AgentRegistryEntry>;
  heartbeatAgent(id: string, meta?: Partial<AgentRegistryEntry>): Promise<AgentRegistryEntry | null>;
  getAgentRegistry(): Promise<AgentRegistryEntry[]>;
  removeAgent(id: string): Promise<boolean>;
  // Datasets
  listDatasets(): Promise<DatasetMeta[]>;
  registerDataset(meta: Omit<DatasetMeta, 'id' | 'createdAt'> & { id?: string }): Promise<DatasetMeta>;
  removeDataset(id: string): Promise<boolean>;
}

export type RouterEngine = 'llm' | 'ml' | 'rules' | 'hybrid';

export interface RouterConfig {
  engine: RouterEngine;
  modelLoaded: boolean;
  modelVersion?: string;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
  costEstimatePerDecision?: number;
}

export type AgentHealth = 'healthy' | 'unhealthy';
export interface AgentRegistryEntry {
  id: string;
  name: string;
  capabilities: string[];
  // Optional richer metadata for routing and display
  type?: string;
  model?: string;
  routingHints?: string[];
  lastSeen: number; // epoch ms
  health: AgentHealth;
}

export class MemStorage implements IStorage {
  private expertAgents: Map<string, ExpertAgent>;
  private requests: Map<string, Request>;
  private routerMetrics: RouterMetrics;
  private systemLogs: SystemLog[];
  private systemMetrics: SystemMetrics;
  private routerConfig: RouterConfig;
  private agentRegistry: Map<string, AgentRegistryEntry>;
  private datasets: Map<string, DatasetMeta>;

  constructor() {
    this.expertAgents = new Map();
    this.requests = new Map();
    this.systemLogs = [];
    this.agentRegistry = new Map();
    this.datasets = new Map();
    this.routerConfig = {
      engine: (process.env.ROUTER_ENGINE as RouterEngine) || 'llm',
      modelLoaded: false,
      modelVersion: undefined,
      latencyP50Ms: undefined,
      latencyP95Ms: undefined,
      costEstimatePerDecision: undefined,
    };
    
    // Initialize with default expert agents
    const defaultAgents: ExpertAgent[] = [
      {
        id: 'credit-agent',
        name: 'Credit Check Agent',
        type: 'credit',
        status: 'idle',
        model: 'Groq Llama 3.1 70B',
        parameters: '70B',
        cpuUsage: 15,
        memoryUsage: '2.8GB',
        tokensPerMinute: 890,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 70,
        responseTime: 1.2,
        isScaling: false,
      },
      {
        id: 'fraud-agent',
        name: 'Fraud Detection Agent',
        type: 'fraud',
        status: 'idle',
        model: 'Groq Mixtral 8x7B',
        parameters: '8x7B',
        cpuUsage: 12,
        memoryUsage: '2.1GB',
        tokensPerMinute: 670,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 80,
        responseTime: 1.8,
        isScaling: false,
      },
      {
        id: 'esg-agent',
        name: 'ESG Analysis Agent',
        type: 'esg',
        status: 'idle',
        model: 'Groq Llama 3.1 70B',
        parameters: '70B',
        cpuUsage: 10,
        memoryUsage: '2.3GB',
        tokensPerMinute: 540,
        queueLength: 0,
        instanceCount: 1,
        loadThreshold: 60,
        responseTime: 2.1,
        isScaling: false,
      },
    ];

    defaultAgents.forEach(agent => {
      this.expertAgents.set(agent.id, agent);
    });

    // Auto-register default agents into Agent Registry so Admin UI sees them immediately
    const now = Date.now();
    defaultAgents.forEach(agent => {
      this.agentRegistry.set(agent.id, {
        id: agent.id,
        name: agent.name,
        capabilities: [agent.type],
        type: agent.type,
        model: agent.model,
        lastSeen: now,
        health: 'healthy',
      });
    });

    this.routerMetrics = {
      contextSize: '128K tokens',
      responseThreshold: '5.0s',
      loadBalancing: true,
      routingAlgorithm: 'Weighted Round-Robin',
      cpuUsage: 67,
      memoryUsage: '4.2GB',
      tokensPerMinute: 2100,
      queueDepth: 3,
      activeRequests: 12,
      avgResponseTime: 2.3,
    };

    this.systemMetrics = {
      throughput: 847,
      avgResponseTime: 2.1,
      successRate: 99.2,
      errorRate: 0.8,
      requestsPerMinute: 8.5,
    };
  }

  async getExpertAgents(): Promise<ExpertAgent[]> {
    return Array.from(this.expertAgents.values());
  }

  async updateExpertAgent(id: string, updates: Partial<ExpertAgent>): Promise<ExpertAgent> {
    let agent = this.expertAgents.get(id);
    if (!agent) {
      // Upsert behavior: create a new expert agent from registry metadata if missing
      const reg = this.agentRegistry.get(id);
      const type = reg?.type || (id.split('-')[0] || 'generic');
      agent = {
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
    }
    const updatedAgent = { ...agent, ...updates } as ExpertAgent;
    this.expertAgents.set(id, updatedAgent);
    return updatedAgent;
  }

  async getRequests(): Promise<Request[]> {
    return Array.from(this.requests.values());
  }

  async addRequest(request: Request): Promise<Request> {
    this.requests.set(request.id, request);
    return request;
  }

  async updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
    const request = this.requests.get(id);
    if (!request) {
      throw new Error(`Request with id ${id} not found`);
    }
    const updatedRequest = { ...request, ...updates };
    this.requests.set(id, updatedRequest);
    return updatedRequest;
  }

  async getRouterMetrics(): Promise<RouterMetrics> {
    return this.routerMetrics;
  }

  async updateRouterMetrics(updates: Partial<RouterMetrics>): Promise<RouterMetrics> {
    this.routerMetrics = { ...this.routerMetrics, ...updates };
    return this.routerMetrics;
  }

  async getSystemLogs(): Promise<SystemLog[]> {
    return this.systemLogs.slice(-50); // Return last 50 logs
  }

  async addSystemLog(log: SystemLog): Promise<SystemLog> {
    this.systemLogs.push(log);
    return log;
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.systemMetrics;
  }

  async updateSystemMetrics(updates: Partial<SystemMetrics>): Promise<SystemMetrics> {
    this.systemMetrics = { ...this.systemMetrics, ...updates };
    return this.systemMetrics;
  }

  async getRouterConfig(): Promise<RouterConfig> {
    // Reflect any runtime env override for engine
    const envEngine = (process.env.ROUTER_ENGINE as RouterEngine) || this.routerConfig.engine;
    return { ...this.routerConfig, engine: envEngine };
  }

  async setRouterConfig(updates: Partial<RouterConfig>): Promise<RouterConfig> {
    // Update in-memory config
    this.routerConfig = { ...this.routerConfig, ...updates };
    // If engine updated, mirror to process.env for immediate effect
    if (updates.engine) {
      process.env.ROUTER_ENGINE = updates.engine;
    }
    return this.routerConfig;
  }

  // Agent Registry Implementation
  async registerAgent(agent: AgentRegistryEntry): Promise<AgentRegistryEntry> {
    const now = Date.now();
    const entry: AgentRegistryEntry = {
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities || [],
      type: agent.type,
      model: agent.model,
      routingHints: agent.routingHints,
      lastSeen: now,
      health: 'healthy',
    };
    this.agentRegistry.set(entry.id, entry);
    return entry;
  }

  async heartbeatAgent(id: string, meta?: Partial<AgentRegistryEntry>): Promise<AgentRegistryEntry | null> {
    const existing = this.agentRegistry.get(id);
    if (!existing) return null;
    const now = Date.now();
    const updated: AgentRegistryEntry = {
      ...existing,
      ...meta,
      lastSeen: now,
      health: 'healthy',
    };
    this.agentRegistry.set(id, updated);
    return updated;
  }

  async getAgentRegistry(): Promise<AgentRegistryEntry[]> {
    const now = Date.now();
    // mark stale as unhealthy if > 30s since lastSeen
    const entries = Array.from(this.agentRegistry.values()).map(e => {
      const healthy = now - e.lastSeen < 30000;
      return { ...e, health: healthy ? 'healthy' : 'unhealthy' as AgentHealth };
    });
    // persist updated health states back into map
    for (const e of entries) this.agentRegistry.set(e.id, e);
    return entries;
  }

  async removeAgent(id: string): Promise<boolean> {
    return this.agentRegistry.delete(id);
  }

  // Dataset registry
  async listDatasets(): Promise<DatasetMeta[]> {
    return Array.from(this.datasets.values());
  }

  async registerDataset(meta: Omit<DatasetMeta, 'id' | 'createdAt'> & { id?: string }): Promise<DatasetMeta> {
    const id = meta.id || `ds_${Date.now()}`;
    const entry: DatasetMeta = {
      id,
      name: meta.name,
      source: meta.source,
      url: meta.url,
      records: meta.records,
      sizeBytes: meta.sizeBytes,
      createdAt: new Date().toISOString(),
    };
    this.datasets.set(id, entry);
    return entry;
  }

  async removeDataset(id: string): Promise<boolean> {
    return this.datasets.delete(id);
  }
}

// Factory: choose storage backend via env
// STORAGE=sqlite will persist to data/moe.db (or SQLITE_PATH)
const STORAGE_BACKEND = (process.env.STORAGE || '').toLowerCase();
let storageImpl: IStorage;
if (STORAGE_BACKEND === 'sqlite') {
  const dbPath = process.env.SQLITE_PATH; // optional override
  storageImpl = new SqliteStorage(dbPath);
} else {
  storageImpl = new MemStorage();
}

export const storage = storageImpl;
