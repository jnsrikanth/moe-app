import { RouterStrategy, RoutingDecision } from './RouterStrategy';
import { storage } from '../storage';

const TYPE_TO_CANONICAL: Record<string, 'credit-agent' | 'fraud-agent' | 'esg-agent'> = {
  credit: 'credit-agent',
  fraud: 'fraud-agent',
  esg: 'esg-agent',
  // Banking PoC templates mapping
  kyc: 'fraud-agent',
  'kyc / kyb': 'fraud-agent',
  'kyc-kyb': 'fraud-agent',
  'doc-processing': 'fraud-agent',
  onboarding: 'credit-agent',
  'credit-underwriting': 'credit-agent',
  'pricing-offer': 'credit-agent',
  'investment-suitability': 'esg-agent',
};

export class RulesRouterStrategy implements RouterStrategy {
  async route(request: any): Promise<RoutingDecision> {
    const text = String(request?.type || '').toLowerCase();

    // Base heuristic from keywords
    const baseSelected = (() => {
      if (text.includes('loan') || text.includes('credit') || text.includes('underwriting')) return ['credit-agent'];
      if (text.includes('fraud') || text.includes('claim') || text.includes('kyc')) return ['fraud-agent'];
      if (text.includes('esg') || text.includes('investment') || text.includes('suitability')) return ['esg-agent'];
      if (text.includes('onboarding') || text.includes('pricing')) return ['credit-agent'];
      if (text.includes('document') || text.includes('doc')) return ['fraud-agent'];
      return ['credit-agent', 'fraud-agent'];
    })();

    // Try to bias using registry routingHints/types
    try {
      const registry = await storage.getAgentRegistry();
      const healthy = registry.filter(r => (r.health || 'healthy') === 'healthy');
      const scores: Record<'credit-agent' | 'fraud-agent' | 'esg-agent', number> = {
        'credit-agent': 0,
        'fraud-agent': 0,
        'esg-agent': 0,
      };

      // Seed scores from base heuristic
      for (const id of baseSelected) scores[id as keyof typeof scores] += 1.5;

      for (const r of healthy) {
        const t = String(r.type || '').toLowerCase();
        const canonical = TYPE_TO_CANONICAL[t as keyof typeof TYPE_TO_CANONICAL] || TYPE_TO_CANONICAL[t.replace(/\s+/g, ' ') as keyof typeof TYPE_TO_CANONICAL];
        const id = canonical || (t === 'credit' || t === 'fraud' || t === 'esg' ? (t + '-agent') : undefined);
        if (!id || !(id in scores)) continue;

        // Match by explicit type words in request
        if (t && text.includes(t)) scores[id as keyof typeof scores] += 1.0;

        // Match by routingHints tokens present in text
        const hints = Array.isArray(r.routingHints) ? r.routingHints : [];
        for (const h of hints) {
          const hv = String(h).toLowerCase();
          // token can be key:value or key=value; match value and key if present in text
          const m = hv.match(/^[^:=]+[:=](.+)$/);
          const val = m ? m[1] : hv;
          if (val && text.includes(val)) scores[id as keyof typeof scores] += 0.75;
        }
      }

      // Choose top 1 or 2 based on scores
      const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const topScore = ranked[0][1];
      const selected = ranked.filter(([, s]) => s >= topScore - 0.5).map(([id]) => id);

      return {
        selectedAgents: selected.length ? selected : baseSelected,
        reasoning: 'Rules router: keyword + registry routingHints/type bias',
      };
    } catch {
      // Fallback to base heuristic only
      return {
        selectedAgents: baseSelected,
        reasoning: 'Rules router: keyword-based heuristic applied',
      };
    }
  }
}
