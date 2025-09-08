import { generateText } from './vertex';
import type { CreditAnalyzeRequest } from './types';

const MODEL = process.env.CREDIT_MODEL || process.env.AGENT_MODEL_CREDIT || process.env.ROUTER_MODEL || 'gemini-2.5-flash-lite';
const KILL_SWITCH = process.env.CREDIT_AGENT_KILL_SWITCH === '1';

export async function analyzeCredit(req: CreditAnalyzeRequest) {
  const start = Date.now();

  if (KILL_SWITCH) {
    return {
      status: 'success',
      credit_score: 720,
      risk_level: 'Low',
      key_factors: ['Kill switch simulation'],
      confidence: 0.9,
      rationale: 'Simulated response',
      processing_time_ms: Date.now() - start,
    } as const;
  }

  const prompt = `You are a Credit Check Expert Agent. Analyze this loan application and respond in strict JSON.

Application Data:
${JSON.stringify(req, null, 2)}

Respond ONLY with JSON in this schema:
{
  "credit_score": number (300-850),
  "risk_level": "Low" | "Medium" | "High",
  "key_factors": string[],
  "confidence": number (0..1),
  "rationale": string
}`;

  const text = await generateText({ model: MODEL, prompt });
  // Try to parse JSON; if it fails, wrap fallback
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      credit_score: 650,
      risk_level: 'Medium',
      key_factors: ['LLM output was non-JSON; using fallback'],
      confidence: 0.5,
      rationale: text.slice(0, 250),
    };
  }

  return {
    status: 'success',
    credit_score: Math.min(850, Math.max(300, Number(parsed.credit_score) || 650)),
    risk_level: ['Low', 'Medium', 'High'].includes(parsed.risk_level) ? parsed.risk_level : 'Medium',
    key_factors: Array.isArray(parsed.key_factors) ? parsed.key_factors.map(String) : [],
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
    rationale: String(parsed.rationale || 'Analysis complete'),
    processing_time_ms: Date.now() - start,
  } as const;
}
