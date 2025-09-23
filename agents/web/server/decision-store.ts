import fs from 'fs';
import path from 'path';

export type DecisionRecord = {
  id: string; // decision id
  requestId: string;
  type?: string;
  assignedAgents: string[];
  routing?: {
    engine?: string;
    reasoning?: string;
  };
  agentResults?: Array<{ agentId?: string; agentType?: string; summary?: string; raw?: string }>;
  final: { status: 'Approved' | 'Declined'; rationale: string };
  createdAt: string; // ISO
  processingTimeMs?: number;
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export class DecisionStore {
  private file: string;

  constructor(filePath?: string) {
    this.file = filePath || path.resolve(process.cwd(), 'data', 'decisions.jsonl');
    ensureDir(path.dirname(this.file));
    // create file if missing
    try { if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, ''); } catch {}
  }

  append(decision: DecisionRecord): void {
    const line = JSON.stringify(decision);
    fs.appendFileSync(this.file, line + '\n');
  }

  list(limit = 50): DecisionRecord[] {
    try {
      const data = fs.readFileSync(this.file, 'utf-8');
      const lines = data.split('\n').filter(Boolean);
      const slice = lines.slice(-limit);
      return slice.map(l => JSON.parse(l));
    } catch {
      return [];
    }
  }

  getByRequestId(requestId: string): DecisionRecord | undefined {
    try {
      const data = fs.readFileSync(this.file, 'utf-8');
      const lines = data.split('\n').filter(Boolean).reverse();
      for (const l of lines) {
        const rec = JSON.parse(l);
        if (rec.requestId === requestId) return rec;
      }
    } catch {}
    return undefined;
  }
}

export const decisionStore = new DecisionStore();