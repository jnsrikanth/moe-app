import { z } from "zod";

// MoE System Schemas
export const expertAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['credit', 'fraud', 'esg']),
  status: z.enum(['idle', 'processing', 'overloaded']),
  model: z.string(),
  parameters: z.string(),
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.string(),
  tokensPerMinute: z.number(),
  queueLength: z.number(),
  instanceCount: z.number(),
  loadThreshold: z.number(),
  responseTime: z.number(),
  isScaling: z.boolean(),
});

export const requestSchema = z.object({
  id: z.string(),
  type: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  timestamp: z.string(),
  processingTime: z.number().optional(),
  assignedAgents: z.array(z.string()),
});

export const routerMetricsSchema = z.object({
  contextSize: z.string(),
  responseThreshold: z.string(),
  loadBalancing: z.boolean(),
  routingAlgorithm: z.string(),
  cpuUsage: z.number(),
  memoryUsage: z.string(),
  tokensPerMinute: z.number(),
  queueDepth: z.number(),
  activeRequests: z.number(),
  avgResponseTime: z.number(),
});

export const systemLogSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: z.enum(['info', 'warning', 'error', 'success']),
  message: z.string(),
  source: z.string(),
});

export const systemMetricsSchema = z.object({
  throughput: z.number(),
  avgResponseTime: z.number(),
  successRate: z.number(),
  errorRate: z.number(),
  requestsPerMinute: z.number(),
});

export type ExpertAgent = z.infer<typeof expertAgentSchema>;
export type Request = z.infer<typeof requestSchema>;
export type RouterMetrics = z.infer<typeof routerMetricsSchema>;
export type SystemLog = z.infer<typeof systemLogSchema>;
export type SystemMetrics = z.infer<typeof systemMetricsSchema>;
