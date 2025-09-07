import { RouterStrategy, RoutingDecision } from './RouterStrategy';
import { storage } from '../storage';

export class RouterOrchestrator {
  constructor(
    private readonly strategies: {
      llm?: (request: any) => Promise<RoutingDecision>;
      ml?: RouterStrategy;
      rules: RouterStrategy;
    },
    private readonly getEngine: () => string = () => process.env.ROUTER_ENGINE || 'llm'
  ) {}

  async route(request: any): Promise<RoutingDecision> {
    const engine = this.getEngine().toLowerCase();

    let decision: RoutingDecision | null = null;

    if (engine === 'rules') {
      decision = await this.strategies.rules.route(request);
    } else if (engine === 'ml') {
      if (this.strategies.ml) {
        try {
          decision = await this.strategies.ml.route(request);
        } catch {
          // fall through to rules
        }
      }
      if (!decision) {
        const rules = await this.strategies.rules.route(request);
        decision = { ...rules, reasoning: `${rules.reasoning} (ML unavailable, used rules)` };
      }
    } else if (engine === 'llm') {
      if (!this.strategies.llm) {
        // If llm delegate is missing, fall back to rules
        const rules = await this.strategies.rules.route(request);
        decision = { ...rules, reasoning: `${rules.reasoning} (LLM unavailable, used rules)` };
      } else {
        decision = await this.strategies.llm(request);
      }
    } else if (engine === 'hybrid') {
      // hybrid: prefer ML, then LLM, then rules
      if (this.strategies.ml) {
        try {
          decision = await this.strategies.ml.route(request);
        } catch {}
      }
      if (!decision && this.strategies.llm) {
        try {
          decision = await this.strategies.llm(request);
        } catch {}
      }
      if (!decision) decision = await this.strategies.rules.route(request);
    } else {
      // Default behavior mirrors current: try LLM then rules
      if (this.strategies.llm) {
        try {
          decision = await this.strategies.llm(request);
        } catch {}
      }
      if (!decision) decision = await this.strategies.rules.route(request);
    }

    // Registry-aware filtering: prefer healthy agents if available
    try {
      const registry = await storage.getAgentRegistry();
      const healthy = new Set(registry.filter(r => r.health === 'healthy').map(r => r.id));
      const filtered = decision.selectedAgents.filter(id => healthy.has(id));
      if (filtered.length > 0) {
        return {
          ...decision,
          selectedAgents: filtered,
          reasoning: `${decision.reasoning} (filtered by registry: using healthy agents)`,
        };
      }
      // If none healthy, return original list to avoid blocking
      return {
        ...decision,
        reasoning: `${decision.reasoning} (no healthy registry matches; using original selection)`,
      };
    } catch {
      // On any failure, return original decision
      return decision;
    }
  }
}

