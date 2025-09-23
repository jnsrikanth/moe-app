import fs from 'fs';
import path from 'path';
import { MemStorage, type IStorage, type AgentRegistryEntry, type RouterConfig, type DatasetMeta } from './storage';
import { type ExpertAgent, type Request, type RouterMetrics, type SystemLog, type SystemMetrics } from "../shared/schema";

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

export class FileStorage implements IStorage {
  private mem = new MemStorage();
  private registryFile: string;

  constructor(filePath?: string) {
    this.registryFile = filePath || path.resolve(process.cwd(), 'data', 'agent_registry.json');
    ensureDir(path.dirname(this.registryFile));
    this.loadRegistry();
  }

  // Persistence helpers
  private loadRegistry() {
    try {
      if (!fs.existsSync(this.registryFile)) return;
      const raw = fs.readFileSync(this.registryFile, 'utf-8');
      const arr = JSON.parse(raw) as AgentRegistryEntry[];
      for (const e of arr) {
        // re-register into mem store to populate maps
        void this.mem.registerAgent(e);
      }
    } catch {}
  }
  private saveRegistry(entries?: AgentRegistryEntry[]) {
    try {
      const regs = entries || (this.mem.getAgentRegistry && (this.mem as any).getAgentRegistry()) || [];
      fs.writeFileSync(this.registryFile, JSON.stringify(regs, null, 2), 'utf-8');
    } catch {}
  }

  // IStorage passthroughs + registry persistence
  async getExpertAgents(): Promise<ExpertAgent[]> { return this.mem.getExpertAgents(); }
  async updateExpertAgent(id: string, updates: Partial<ExpertAgent>): Promise<ExpertAgent> { return this.mem.updateExpertAgent(id, updates); }
  async getRequests(): Promise<Request[]> { return this.mem.getRequests(); }
  async addRequest(request: Request): Promise<Request> { return this.mem.addRequest(request); }
  async updateRequest(id: string, updates: Partial<Request>): Promise<Request> { return this.mem.updateRequest(id, updates); }
  async getRouterMetrics(): Promise<RouterMetrics> { return this.mem.getRouterMetrics(); }
  async updateRouterMetrics(updates: Partial<RouterMetrics>): Promise<RouterMetrics> { return this.mem.updateRouterMetrics(updates); }
  async getSystemLogs(): Promise<SystemLog[]> { return this.mem.getSystemLogs(); }
  async addSystemLog(log: SystemLog): Promise<SystemLog> { return this.mem.addSystemLog(log); }
  async getSystemMetrics(): Promise<SystemMetrics> { return this.mem.getSystemMetrics(); }
  async updateSystemMetrics(updates: Partial<SystemMetrics>): Promise<SystemMetrics> { return this.mem.updateSystemMetrics(updates); }
  async getRouterConfig(): Promise<RouterConfig> { return this.mem.getRouterConfig(); }
  async setRouterConfig(updates: Partial<RouterConfig>): Promise<RouterConfig> { return this.mem.setRouterConfig(updates); }

  async registerAgent(agent: AgentRegistryEntry): Promise<AgentRegistryEntry> {
    const e = await this.mem.registerAgent(agent);
    const regs = await this.mem.getAgentRegistry();
    this.saveRegistry(regs);
    return e;
  }
  async heartbeatAgent(id: string, meta?: Partial<AgentRegistryEntry>): Promise<AgentRegistryEntry | null> {
    const e = await this.mem.heartbeatAgent(id, meta);
    const regs = await this.mem.getAgentRegistry();
    this.saveRegistry(regs);
    return e;
  }
  async getAgentRegistry(): Promise<AgentRegistryEntry[]> { return this.mem.getAgentRegistry(); }
  async removeAgent(id: string): Promise<boolean> {
    const ok = await this.mem.removeAgent(id);
    const regs = await this.mem.getAgentRegistry();
    this.saveRegistry(regs);
    return ok;
  }

  async listDatasets(): Promise<DatasetMeta[]> { return this.mem.listDatasets(); }
  async registerDataset(meta: Omit<DatasetMeta, 'id' | 'createdAt'> & { id?: string }): Promise<DatasetMeta> { return this.mem.registerDataset(meta); }
  async removeDataset(id: string): Promise<boolean> { return this.mem.removeDataset(id); }
}