import { type ExpertAgent, type Request, type RouterMetrics, type SystemLog, type SystemMetrics } from "../shared/schema.js";

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
}

export class MemStorage implements IStorage {
  private expertAgents: Map<string, ExpertAgent>;
  private requests: Map<string, Request>;
  private routerMetrics: RouterMetrics;
  private systemLogs: SystemLog[];
  private systemMetrics: SystemMetrics;

  constructor() {
    this.expertAgents = new Map();
    this.requests = new Map();
    this.systemLogs = [];
    
    // Initialize with default expert agents
    const defaultAgents: ExpertAgent[] = [
      {
        id: 'credit-agent',
        name: 'Credit Check Agent',
        type: 'credit',
        status: 'processing',
        model: 'Groq Llama 3.1 70B',
        parameters: '70B',
        cpuUsage: 67,
        memoryUsage: '2.8GB',
        tokensPerMinute: 890,
        queueLength: 2,
        instanceCount: 3,
        loadThreshold: 70,
        responseTime: 1.2,
        isScaling: true,
      },
      {
        id: 'fraud-agent',
        name: 'Fraud Detection Agent',
        type: 'fraud',
        status: 'idle',
        model: 'Groq Mixtral 8x7B',
        parameters: '8x7B',
        cpuUsage: 45,
        memoryUsage: '2.1GB',
        tokensPerMinute: 670,
        queueLength: 1,
        instanceCount: 1,
        loadThreshold: 80,
        responseTime: 1.8,
        isScaling: false,
      },
      {
        id: 'esg-agent',
        name: 'ESG Analysis Agent',
        type: 'esg',
        status: 'processing',
        model: 'Groq Llama 3.1 70B',
        parameters: '70B',
        cpuUsage: 34,
        memoryUsage: '2.3GB',
        tokensPerMinute: 540,
        queueLength: 1,
        instanceCount: 1,
        loadThreshold: 60,
        responseTime: 2.1,
        isScaling: false,
      },
    ];

    defaultAgents.forEach(agent => {
      this.expertAgents.set(agent.id, agent);
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
    const agent = this.expertAgents.get(id);
    if (!agent) {
      throw new Error(`Expert agent with id ${id} not found`);
    }
    const updatedAgent = { ...agent, ...updates };
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
}

export const storage = new MemStorage();
