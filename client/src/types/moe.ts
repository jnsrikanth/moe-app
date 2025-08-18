export interface ExpertAgent {
  id: string;
  name: string;
  type: 'credit' | 'fraud' | 'esg';
  status: 'idle' | 'processing' | 'overloaded';
  model: string;
  parameters: string;
  cpuUsage: number;
  memoryUsage: string;
  tokensPerMinute: number;
  queueLength: number;
  instanceCount: number;
  loadThreshold: number;
  responseTime: number;
  isScaling: boolean;
}

export interface Request {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: string;
  processingTime?: number;
  assignedAgents: string[];
}

export interface RouterMetrics {
  contextSize: string;
  responseThreshold: string;
  loadBalancing: boolean;
  routingAlgorithm: string;
  cpuUsage: number;
  memoryUsage: string;
  tokensPerMinute: number;
  queueDepth: number;
  activeRequests: number;
  avgResponseTime: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  source: string;
}

export interface SystemMetrics {
  throughput: number;
  avgResponseTime: number;
  successRate: number;
  errorRate: number;
  requestsPerMinute: number;
}

export interface WebSocketMessage {
  type: string;
  data: any;
}
