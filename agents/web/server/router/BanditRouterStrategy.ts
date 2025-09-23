import { RouterStrategy, RoutingDecision } from './RouterStrategy';
import path from 'path';
import fs from 'fs';
import { storage } from '../storage';

// Simple contextual bandit wrapper over the rules strategy.
// - Keeps reward counts per agentId and simple UCB1 selection.
// - Persists stats to data/bandit-stats.json.

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

export type BanditStats = Record<string, { n: number; reward: number }>;

class BanditStore {
  private file: string;
  constructor(filePath?: string) {
    this.file = filePath || path.resolve(process.cwd(), 'data', 'bandit-stats.json');
    ensureDir(path.dirname(this.file));
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, JSON.stringify({}), 'utf-8');
  }
  read(): BanditStats {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf-8')); } catch { return {}; }
  }
  write(stats: BanditStats) { fs.writeFileSync(this.file, JSON.stringify(stats, null, 2), 'utf-8'); }
}

export class BanditRouterStrategy implements RouterStrategy {
  private rules: RouterStrategy;
  private store = new BanditStore();
  private stats: BanditStats;

  constructor(rules: RouterStrategy) {
    this.rules = rules;
    this.stats = this.store.read();
  }

  private ucbScore(id: string, totalN: number): number {
    const s = this.stats[id] || { n: 0, reward: 0 };
    if (s.n === 0) return 1e9; // force try unseen
    const avg = s.reward / s.n;
    const bonus = Math.sqrt((2 * Math.log(Math.max(1, totalN))) / s.n);
    return avg + bonus;
  }

  async route(request: any): Promise<RoutingDecision> {
    // Start from rules to get candidates
    const base = await this.rules.route(request);

    // Filter by registry health
    let candidates = base.selectedAgents.slice();
    try {
      const registry = await storage.getAgentRegistry();
      const healthy = new Set(registry.filter(r => r.health === 'healthy').map(r => r.id));
      const filtered = candidates.filter(id => healthy.has(id));
      if (filtered.length) candidates = filtered;
    } catch {}

    // Rank by UCB
    const totalN = Object.values(this.stats).reduce((s, v) => s + v.n, 0) || 1;
    candidates.sort((a, b) => this.ucbScore(b, totalN) - this.ucbScore(a, totalN));

    // Choose top-1 or top-2 if strongly tied
    const chosen: string[] = [candidates[0]];
    if (candidates[1]) {
      const diff = Math.abs(this.ucbScore(candidates[1], totalN) - this.ucbScore(candidates[0], totalN));
      if (diff < 0.05) chosen.push(candidates[1]);
    }

    return {
      selectedAgents: chosen,
      reasoning: `Bandit+Rules: ${base.reasoning}`,
    };
  }

  // Public hook to update rewards from outside (e.g., after decision known)
  updateReward(agentId: string, reward: number) {
    const s = this.stats[agentId] || { n: 0, reward: 0 };
    s.n += 1; s.reward += reward;
    this.stats[agentId] = s;
    this.store.write(this.stats);
  }
}