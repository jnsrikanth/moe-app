import { generateText } from './vertex';
import { localAIService } from './local-ai-service';

export type AIProvider = 'vertex' | 'local';

export interface AnalysisResult {
  analysis: string;
  score: number;
  confidence: number;
  reasoning: string;
  processingTime: number;
}

// Environment variables
const DEFAULT_MODEL = process.env.AGENT_MODEL_DEFAULT || process.env.ROUTER_MODEL || 'gemini-1.5-flash';
const CREDIT_MODEL = process.env.AGENT_MODEL_CREDIT || DEFAULT_MODEL;
const FRAUD_MODEL = process.env.AGENT_MODEL_FRAUD || DEFAULT_MODEL;
const ESG_MODEL = process.env.AGENT_MODEclass AIService {
  private provider: AIProvider = DEFAULT_PROVIDER as AIProvider;
  private vertexFailed = false;

  /**
   * Set the AI provider to use
   * @param provider 'vertex' or 'local'
   */
  setProvider(provider: AIProvider) {
    this.provider = provider;
    console.log(`Switching to ${provider} AI provider`);
  }

  /**
   * Get the current AI provider
   */
  getProvider(): AIProvider {
    return this.provider;
  }

  async testConnection(): Promise<boolean> {
    try {
      const text = await generateText({ model: DEFAULT_MODEL, prompt: 'Reply with OK' });
      return !!text;
    } catch (e) {
      console.error('Vertex connection test failed:', e);
      return false;
    }
  }

  async analyzeCreditApplication(applicationData: any): Promise<AnalysisResult> {
    const start = Date.now();
    const prompt = `You are a credit analysis expert. Analyze this loan application and provide a credit assessment.

Application Data:
${JSON.stringify(applicationData, null, 2)}

Please provide:
1. A credit score (300-850)
2. Risk assessment
3. Key factors influencing the decision
4. Confidence level (0-100%)

Respond in JSON format with: score, risk_level, key_factors, confidence, reasoning`;

    const content = await generateText({ model: CREDIT_MODEL, prompt });
    const processingTime = Date.now() - start;
    try {
      const parsed = JSON.parse(content);
      return {
        analysis: content,
        score: parsed.score ?? 650,
        confidence: parsed.confidence ?? 75,
        reasoning: parsed.reasoning ?? parsed.key_factors ?? 'Analysis completed',
        processingTime,
      };
    } catch {
      return {
        analysis: content,
        score: this.extractScoreFromText(content),
        confidence: 80,
        reasoning: content.substring(0, 200) + '...',
        processingTime,
      };
    }
  }

  async detectFraud(transactionData: any): Promise<AnalysisResult> {
    const start = Date.now();
    const prompt = `You are a fraud detection expert. Analyze this transaction for potential fraud indicators.

Transaction Data:
${JSON.stringify(transactionData, null, 2)}

Analyze for:
1. Unusual patterns
2. Risk indicators
3. Fraud probability (0-100%)
4. Recommended action

Respond in JSON format with: fraud_probability, risk_level, indicators, confidence, recommended_action`;

    const content = await generateText({ model: FRAUD_MODEL, prompt });
    const processingTime = Date.now() - start;
    try {
      const parsed = JSON.parse(content);
      return {
        analysis: content,
        score: parsed.fraud_probability ?? 25,
        confidence: parsed.confidence ?? 85,
        reasoning: parsed.indicators ?? parsed.recommended_action ?? 'Fraud analysis completed',
        processingTime,
      };
    } catch {
      return {
        analysis: content,
        score: this.extractScoreFromText(content),
        confidence: 85,
        reasoning: content.substring(0, 200) + '...',
        processingTime,
      };
    }
  }

  async analyzeESG(companyData: any): Promise<AnalysisResult> {
    const start = Date.now();
    const prompt = `You are an ESG (Environmental, Social, Governance) analysis expert. Evaluate this company's ESG performance.

Company Data:
${JSON.stringify(companyData, null, 2)}

Provide ESG assessment:
1. Environmental score (0-100)
2. Social score (0-100)
3. Governance score (0-100)
4. Overall ESG rating
5. Key strengths and concerns

Respond in JSON format with: environmental_score, social_score, governance_score, overall_rating, confidence, key_findings`;

    const content = await generateText({ model: ESG_MODEL, prompt });
    const processingTime = Date.now() - start;
    try {
      const parsed = JSON.parse(content);
      const overallScore = (parsed.environmental_score + parsed.social_score + parsed.governance_score) / 3;
      return {
        analysis: content,
        score: Math.round(overallScore) || 70,
        confidence: parsed.confidence ?? 80,
        reasoning: parsed.key_findings ?? 'ESG analysis completed',
        processingTime,
      };
    } catch {
      return {
        analysis: content,
        score: this.extractScoreFromText(content),
        confidence: 80,
        reasoning: content.substring(0, 200) + '...',
        processingTime,
      };
    }
  }

  private extractScoreFromText(text: string): number {
    const scoreMatch = text.match(/\b([0-9]{1,3})\b/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1]);
      if (score >= 0 && score <= 100) return score;
      if (score >= 300 && score <= 850) return score;
    }
    return 75;
  }
}

class VertexAgentService extends AIService {}
