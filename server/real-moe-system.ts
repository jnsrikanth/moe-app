import Groq from 'groq-sdk';
import { randomUUID } from 'crypto';
import { storage } from './storage';
import { type ExpertAgent, type Request, type SystemLog } from '../shared/schema.js';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface AgentInstance {
  id: string;
  agentType: 'credit' | 'fraud' | 'esg';
  status: 'idle' | 'processing' | 'overloaded';
  currentLoad: number;
  processingQueue: string[];
  startTime: number;
}

export class RealMoESystem {
  private agentInstances: Map<string, AgentInstance> = new Map();
  private processingRequests: Map<string, { startTime: number; agentIds: string[] }> = new Map();
  private broadcastUpdate: (type: string, data: any) => void;
  // Rate limiting and kill switch controls
  private killSwitch = process.env.GROQ_KILL_SWITCH === '1';
  private minIntervalMs = Number.parseInt(process.env.GROQ_MIN_REQUEST_INTERVAL_MS || '15000', 10);
  private nextAllowedAt = 0;

  constructor(broadcastFn: (type: string, data: any) => void) {
    this.broadcastUpdate = broadcastFn;
    this.initializeAgentInstances();
  }

  // Public API: accept a new request, route it, and start processing
  async handleNewRequest(newRequest: Request): Promise<void> {
    // Add to storage and notify clients
    await storage.addRequest(newRequest);
    this.broadcastUpdate('new_request', newRequest);

    // Route to appropriate agents
    const agentIds = await this.routeRequest(newRequest);

    // Update request with assigned agents and set to processing
    const updated = await storage.updateRequest(newRequest.id, {
      assignedAgents: agentIds,
      status: 'processing',
    });
    this.broadcastUpdate('request_updated', updated);

    // Begin processing
    await this.processRequest(newRequest.id, agentIds);
  }

  private initializeAgentInstances() {
    // Initialize with the same agent structure as the frontend expects
    const agentConfigs = [
      { id: 'credit-agent', type: 'credit' as const, threshold: 70 },
      { id: 'fraud-agent', type: 'fraud' as const, threshold: 80 },
      { id: 'esg-agent', type: 'esg' as const, threshold: 60 },
    ];

    agentConfigs.forEach(config => {
      this.agentInstances.set(config.id, {
        id: config.id,
        agentType: config.type,
        status: 'idle',
        currentLoad: Math.random() * 30 + 10, // Start with low load
        processingQueue: [],
        startTime: Date.now(),
      });
    });
  }

  // MoE Router - Intelligent request routing
  async routeRequest(request: Request): Promise<string[]> {
    const routingDecision = await this.makeRoutingDecision(request);
    
    // Log routing decision
    const routeLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      message: `MoE Router: ${request.type} → ${routingDecision.selectedAgents.join(', ')}`,
      source: 'MoE Router',
    };
    await storage.addSystemLog(routeLog);
    this.broadcastUpdate('new_log', routeLog);

    // Also log reasoning for transparency
    if (routingDecision.reasoning) {
      const reasonLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: `Routing reasoning: ${routingDecision.reasoning}`,
        source: 'MoE Router',
      };
      await storage.addSystemLog(reasonLog);
      this.broadcastUpdate('new_log', reasonLog);
    }

    return routingDecision.selectedAgents;
  }

  private async makeRoutingDecision(request: Request): Promise<{ selectedAgents: string[]; reasoning: string }> {
    // Use Groq to make intelligent routing decisions
    const prompt = `You are a MoE (Mixture of Experts) routing agent. Analyze this request and decide which expert agents should handle it.

Request: ${JSON.stringify(request, null, 2)}

Available Expert Agents:
1. credit-agent: Credit scoring, loan applications, risk assessment
2. fraud-agent: Fraud detection, transaction analysis, suspicious patterns  
3. esg-agent: ESG analysis, sustainability scoring, governance evaluation

Current Agent Loads:
${Array.from(this.agentInstances.values()).map(agent => 
  `- ${agent.id}: ${agent.currentLoad.toFixed(1)}% CPU, ${agent.processingQueue.length} queued`
).join('\n')}

Decision Criteria (weights):
- Agent Specialization: 35%
- Current Load: 40% 
- Response Time: 25%

Respond with JSON: {"selected_agents": ["agent-id"], "reasoning": "explanation"}`;

    try {
      if (this.killSwitch) {
        return {
          selectedAgents: this.fallbackRouting(request),
          reasoning: 'GROQ_KILL_SWITCH enabled, using fallback routing',
        };
      }

      const response = await this.withRateLimit(() =>
        groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: ROUTER_MODEL, // Using stable 8B model
          max_tokens: 300,
          temperature: 0.3,
        })
      );

      const content = response.choices[0]?.message?.content || '';
      
      try {
        const decision = JSON.parse(content);
        return {
          selectedAgents: decision.selected_agents || this.fallbackRouting(request),
          reasoning: decision.reasoning || 'Routing decision made',
        };
      } catch {
        return {
          selectedAgents: this.fallbackRouting(request),
          reasoning: 'Fallback routing applied',
        };
      }
    } catch (error) {
      console.error('Routing decision failed:', error);
      return {
        selectedAgents: this.fallbackRouting(request),
        reasoning: 'Error in routing, using fallback',
      };
    }
  }

  private fallbackRouting(request: Request): string[] {
    // Simple fallback routing based on request type
    const type = request.type.toLowerCase();
    if (type.includes('loan') || type.includes('credit')) return ['credit-agent'];
    if (type.includes('fraud') || type.includes('claim')) return ['fraud-agent'];
    if (type.includes('esg') || type.includes('investment')) return ['esg-agent'];
    
    // For complex requests, route to multiple agents
    return ['credit-agent', 'fraud-agent'];
  }

  // Process request with assigned agents
  async processRequest(requestId: string, agentIds: string[]): Promise<void> {
    this.processingRequests.set(requestId, {
      startTime: Date.now(),
      agentIds,
    });

    // Update agent loads and status
    for (const agentId of agentIds) {
      const instance = this.agentInstances.get(agentId);
      if (instance) {
        instance.processingQueue.push(requestId);
        instance.currentLoad = Math.min(100, instance.currentLoad + Math.random() * 25 + 15);
        instance.status = instance.currentLoad > 90 ? 'overloaded' : 'processing';
        
        await this.updateAgentMetrics(agentId);
      }
    }

    // Process with each assigned agent, tolerating individual failures
    let agentResults: any[] = [];
    try {
      const settled = await Promise.allSettled(
        agentIds.map(agentId => this.processWithAgent(requestId, agentId))
      );
      agentResults = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);

      // Broadcast agent result summaries for visibility
      for (const res of agentResults) {
        try {
          const summary = typeof res?.analysis === 'string' ? res.analysis.slice(0, 180) : JSON.stringify(res).slice(0, 180);
          const resultLog = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            level: 'info' as const,
            message: `Agent result (${res?.agentType ?? 'unknown'}): ${summary}${summary.length === 180 ? '…' : ''}`,
            source: 'MoE System',
          };
          await storage.addSystemLog(resultLog);
          this.broadcastUpdate('new_log', resultLog);
        } catch {}
      }

      // Optionally log failures
      for (const r of settled) {
        if (r.status === 'rejected') {
          const errLog = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            level: 'error' as const,
            message: `Agent processing failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
            source: 'MoE System',
          };
          await storage.addSystemLog(errLog);
          this.broadcastUpdate('new_log', errLog);
        }
      }
    } catch (e) {
      // This block is unlikely with allSettled, but guard anyway
      const unexpectedLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: `Unexpected processing error: ${e instanceof Error ? e.message : String(e)}`,
        source: 'MoE System',
      };
      await storage.addSystemLog(unexpectedLog);
      this.broadcastUpdate('new_log', unexpectedLog);
    } finally {
      // Aggregate results and complete request regardless of individual agent failures
      await this.completeRequest(requestId, agentResults);
    }
  }

  private async processWithAgent(requestId: string, agentId: string): Promise<any> {
    const request = (await storage.getRequests()).find(r => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);

    const agentType = agentId.split('-')[0] as 'credit' | 'fraud' | 'esg';
    
    // Call the appropriate Groq-powered agent
    switch (agentType) {
      case 'credit':
        return await this.processCreditRequest(request);
      case 'fraud':
        return await this.processFraudRequest(request);
      case 'esg':
        return await this.processESGRequest(request);
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  private async processCreditRequest(request: Request): Promise<any> {
    const prompt = `You are a Credit Check Expert Agent. Analyze this request for credit risk assessment.

Request: ${JSON.stringify(request, null, 2)}

Provide detailed credit analysis including:
- Credit score recommendation (300-850)
- Risk level (Low/Medium/High)
- Key factors
- Confidence level

Respond in JSON format.`;

    if (this.killSwitch) {
      return {
        agentType: 'credit',
        analysis: 'Kill switch active: simulated credit analysis.',
        processingTime: Date.now(),
      };
    }

    const response = await this.withRateLimit(() =>
      groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: AGENT_MODELS.credit, // Credit agent model
        max_tokens: 400,
        temperature: 0.3,
      })
    );

    return {
      agentType: 'credit',
      analysis: response.choices[0]?.message?.content || 'Credit analysis completed',
      processingTime: Date.now(),
    };
  }

  private async processFraudRequest(request: Request): Promise<any> {
    const prompt = `You are a Fraud Detection Expert Agent. Analyze this request for fraud indicators.

Request: ${JSON.stringify(request, null, 2)}

Provide fraud risk assessment including:
- Fraud probability (0-100%)
- Risk indicators
- Recommended actions
- Confidence level

Respond in JSON format.`;

    if (this.killSwitch) {
      return {
        agentType: 'fraud',
        analysis: 'Kill switch active: simulated fraud analysis.',
        processingTime: Date.now(),
      };
    }

    const response = await this.withRateLimit(() =>
      groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: AGENT_MODELS.fraud, // Fraud agent model
        max_tokens: 400,
        temperature: 0.2,
      })
    );

    return {
      agentType: 'fraud',
      analysis: response.choices[0]?.message?.content || 'Fraud analysis completed',
      processingTime: Date.now(),
    };
  }

  private async processESGRequest(request: Request): Promise<any> {
    const prompt = `You are an ESG Analysis Expert Agent. Evaluate this request for ESG factors.

Request: ${JSON.stringify(request, null, 2)}

Provide ESG assessment including:
- Environmental score (0-100)
- Social score (0-100)
- Governance score (0-100)
- Overall ESG rating
- Key findings

Respond in JSON format.`;

    if (this.killSwitch) {
      return {
        agentType: 'esg',
        analysis: 'Kill switch active: simulated ESG analysis.',
        processingTime: Date.now(),
      };
    }

    const response = await this.withRateLimit(() =>
      groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: AGENT_MODELS.esg, // ESG agent model
        max_tokens: 500,
        temperature: 0.4,
      })
    );

    return {
      agentType: 'esg',
      analysis: response.choices[0]?.message?.content || 'ESG analysis completed',
      processingTime: Date.now(),
    };
  }

  private async updateAgentMetrics(agentId: string): Promise<void> {
    const instance = this.agentInstances.get(agentId);
    if (!instance) return;

    const tokensPerMinute = Math.floor(instance.currentLoad * 10 + Math.random() * 200);
    const responseTime = 1.0 + (instance.currentLoad / 100) * 2.0 + Math.random() * 0.5;

    await storage.updateExpertAgent(agentId, {
      status: instance.status,
      cpuUsage: Math.round(instance.currentLoad),
      queueLength: instance.processingQueue.length,
      tokensPerMinute,
      responseTime: Math.round(responseTime * 10) / 10,
      isScaling: instance.currentLoad > 85,
      instanceCount: instance.currentLoad > 85 ? 2 : 1,
      model: AGENT_MODELS[instance.agentType],
    });

    const updatedAgent = (await storage.getExpertAgents()).find(a => a.id === agentId);
    if (updatedAgent) {
      this.broadcastUpdate('agent_updated', updatedAgent);
    }
  }

  private async completeRequest(requestId: string, agentResults: any[]): Promise<void> {
    const start = this.processingRequests.get(requestId)?.startTime || Date.now();
    const durationMs = Date.now() - start;

    // Update request
    await storage.updateRequest(requestId, {
      status: 'completed',
      processingTime: durationMs,
    });

    // Update agents back to idle and remove from queues
    this.agentInstances.forEach(async (instance, agentId) => {
      const idx = instance.processingQueue.indexOf(requestId);
      if (idx >= 0) {
        instance.processingQueue.splice(idx, 1);
        instance.currentLoad = Math.max(5, instance.currentLoad - (10 + Math.random() * 20));
        instance.status = instance.processingQueue.length > 0 ? 'processing' : 'idle';
        await this.updateAgentMetrics(agentId);
      }
    });

    // Broadcast request update
    const req = (await storage.getRequests()).find(r => r.id === requestId);
    if (req) this.broadcastUpdate('request_updated', req);

    this.processingRequests.delete(requestId);

    // Log completion summary
    const completeLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'success' as const,
      message: `Request ${requestId} completed in ${Math.round(durationMs)}ms`,
      source: 'MoE System',
    };
    await storage.addSystemLog(completeLog);
    this.broadcastUpdate('new_log', completeLog);

    // Compute and broadcast FINAL DECISION summary
    try {
      const decision = this.computeFinalDecision(agentResults);
      const finalLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: decision.status === 'Approved' ? 'success' as const : 'warning' as const,
        message: `FINAL DECISION: ${decision.status} — ${decision.rationale}`,
        source: 'MoE Decision',
      };
      await storage.addSystemLog(finalLog);
      this.broadcastUpdate('new_log', finalLog);
    } catch (e) {
      const fallbackLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: 'Final decision summary unavailable (could not parse agent results).',
        source: 'MoE Decision',
      };
      await storage.addSystemLog(fallbackLog);
      this.broadcastUpdate('new_log', fallbackLog);
    }
  }

  // Heuristic final decision aggregator across agent results
  private computeFinalDecision(agentResults: any[]): { status: 'Approved' | 'Declined'; rationale: string } {
    let fraudProb: number | undefined;
    let creditRisk: string | undefined;
    let creditScore: number | undefined;
    let esgOk: boolean | undefined;

    const texts: string[] = [];

    const parseMaybeJSON = (s: string) => {
      try {
        return JSON.parse(s);
      } catch {
        return undefined;
      }
    };

    for (const r of agentResults) {
      const text = typeof r?.analysis === 'string' ? r.analysis : '';
      if (text) texts.push(text);

      const data = text ? parseMaybeJSON(text) : undefined;
      const agentType = r?.agentType as string | undefined;

      if (agentType === 'fraud') {
        // Expect keys like fraud probability 0-100 or 0-1
        let p: number | undefined;
        if (data) {
          p = (data.fraud_probability ?? data.fraudProbability ?? data.probability) as number | undefined;
        }
        if (p === undefined) {
          const m = text.match(/(fraud[^\d]{0,10}|probab)[^\d]{0,10}(\d{1,3})(?:\.(\d+))?%/i);
          if (m) p = Number(`${m[2]}${m[3] ? '.' + m[3] : ''}`);
        }
        if (p !== undefined) {
          fraudProb = p > 1 ? p / 100 : p; // normalize to 0-1
        }
      }

      if (agentType === 'credit') {
        if (data) {
          const risk = (data.risk_level ?? data.riskLevel ?? data.risk) as string | undefined;
          if (risk) creditRisk = String(risk);
          const score = (data.credit_score ?? data.creditScore ?? data.score) as number | undefined;
          if (typeof score === 'number') creditScore = score;
        }
        if (!creditRisk) {
          const rm = text.match(/risk\s*level\s*[:\-]?\s*(low|medium|high)/i);
          if (rm) creditRisk = rm[1];
        }
        if (creditScore === undefined) {
          const sm = text.match(/credit\s*score\s*[:\-]?\s*(\d{3})/i);
          if (sm) creditScore = Number(sm[1]);
        }
      }

      if (agentType === 'esg') {
        if (data) {
          const e = data.environmental_score ?? data.environmentalScore;
          const s = data.social_score ?? data.socialScore;
          const g = data.governance_score ?? data.governanceScore;
          const rating = data.overall_rating ?? data.overallRating ?? data.overall;
          if (typeof e === 'number' && typeof s === 'number' && typeof g === 'number') {
            esgOk = (e + s + g) / 3 >= 50;
          } else if (typeof rating === 'string') {
            esgOk = /a|b|pass|good|positive/i.test(rating);
          }
        }
      }
    }

    // Keyword-based override if any agent gave explicit decision
    const joined = texts.join(' \n ').toLowerCase();
    if (/\b(final|overall)?\s*decision\b[^\n]*\bapprove(d)?\b/.test(joined)) {
      return { status: 'Approved', rationale: 'Explicit approval found in agent outputs.' };
    }
    if (/\b(final|overall)?\s*decision\b[^\n]*\bdecline(d)?|reject(ed)?\b/.test(joined)) {
      return { status: 'Declined', rationale: 'Explicit decline/reject found in agent outputs.' };
    }

    // Heuristics
    const highFraud = fraudProb !== undefined && fraudProb >= 0.6;
    const highRisk = typeof creditRisk === 'string' && /high/i.test(creditRisk);
    const lowScore = typeof creditScore === 'number' && creditScore < 600;
    const poorESG = esgOk === false;

    if (highFraud || highRisk || lowScore) {
      const reasons = [
        highFraud ? `Fraud probability ${(Math.round((fraudProb! * 100)))}%` : null,
        highRisk ? `Credit risk ${creditRisk}` : null,
        lowScore ? `Credit score ${creditScore}` : null,
        poorESG ? 'ESG concerns' : null,
      ].filter(Boolean).join('; ');
      return { status: 'Declined', rationale: reasons || 'Risk thresholds not met.' };
    }

    const reasons = [
      fraudProb !== undefined ? `Fraud probability ${(Math.round(fraudProb * 100))}%` : null,
      creditRisk ? `Credit risk ${creditRisk}` : null,
      creditScore !== undefined ? `Credit score ${creditScore}` : null,
      esgOk === true ? 'ESG acceptable' : null,
    ].filter(Boolean).join('; ');

    return { status: 'Approved', rationale: reasons || 'Heuristics indicate acceptable risk.' };
  }

  private async withRateLimit<T>(runner: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = Math.max(0, this.nextAllowedAt - now);
    if (wait > 0) {
      await new Promise(res => setTimeout(res, wait));
    }
    try {
      const result = await runner();
      this.nextAllowedAt = Date.now() + this.minIntervalMs;
      return result;
    } catch (e) {
      this.nextAllowedAt = Date.now() + this.minIntervalMs;
      throw e;
    }
  }
}

export let realMoESystem: RealMoESystem;

// Exported model constants so the API and UI can reflect real-time labels
export const ROUTER_MODEL = 'llama3-8b-8192';
export const AGENT_MODELS: Record<'credit' | 'fraud' | 'esg', string> = {
  credit: 'llama3-8b-8192',
  fraud: 'llama3-8b-8192',
  esg: 'llama3-8b-8192',
};