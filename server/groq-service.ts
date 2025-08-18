import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export interface AnalysisResult {
  analysis: string;
  score: number;
  confidence: number;
  reasoning: string;
  processingTime: number;
}

export class GroqAgentService {
  
  async testConnection(): Promise<boolean> {
    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'Hello! Just testing the connection.' }],
        model: 'llama3-8b-8192',
        max_tokens: 50,
      });
      
      return response.choices[0]?.message?.content ? true : false;
    } catch (error) {
      console.error('Groq connection test failed:', error);
      return false;
    }
  }

  async analyzeCreditApplication(applicationData: any): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    const prompt = `You are a credit analysis expert. Analyze this loan application and provide a credit assessment.

Application Data:
${JSON.stringify(applicationData, null, 2)}

Please provide:
1. A credit score (300-850)
2. Risk assessment
3. Key factors influencing the decision
4. Confidence level (0-100%)

Respond in JSON format with: score, risk_level, key_factors, confidence, reasoning`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama3-70b-8192', // Using the larger model for better analysis
        max_tokens: 500,
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      const content = response.choices[0]?.message?.content || '';
      const processingTime = Date.now() - startTime;
      
      // Try to parse JSON response, fallback to text analysis
      try {
        const parsed = JSON.parse(content);
        return {
          analysis: content,
          score: parsed.score || 650,
          confidence: parsed.confidence || 75,
          reasoning: parsed.reasoning || parsed.key_factors || 'Analysis completed',
          processingTime,
        };
      } catch {
        // Fallback if JSON parsing fails
        return {
          analysis: content,
          score: this.extractScoreFromText(content),
          confidence: 80,
          reasoning: content.substring(0, 200) + '...',
          processingTime,
        };
      }
    } catch (error) {
      console.error('Credit analysis failed:', error);
      throw new Error(`Credit analysis failed: ${error.message}`);
    }
  }

  async detectFraud(transactionData: any): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    const prompt = `You are a fraud detection expert. Analyze this transaction for potential fraud indicators.

Transaction Data:
${JSON.stringify(transactionData, null, 2)}

Analyze for:
1. Unusual patterns
2. Risk indicators
3. Fraud probability (0-100%)
4. Recommended action

Respond in JSON format with: fraud_probability, risk_level, indicators, confidence, recommended_action`;

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'mixtral-8x7b-32768', // Good for pattern analysis
        max_tokens: 400,
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content || '';
      const processingTime = Date.now() - startTime;
      
      try {
        const parsed = JSON.parse(content);
        return {
          analysis: content,
          score: parsed.fraud_probability || 25,
          confidence: parsed.confidence || 85,
          reasoning: parsed.indicators || parsed.recommended_action || 'Fraud analysis completed',
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
    } catch (error) {
      console.error('Fraud detection failed:', error);
      throw new Error(`Fraud detection failed: ${error.message}`);
    }
  }

  async analyzeESG(companyData: any): Promise<AnalysisResult> {
    const startTime = Date.now();
    
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

    try {
      const response = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama3-70b-8192',
        max_tokens: 600,
        temperature: 0.4,
      });

      const content = response.choices[0]?.message?.content || '';
      const processingTime = Date.now() - startTime;
      
      try {
        const parsed = JSON.parse(content);
        const overallScore = (parsed.environmental_score + parsed.social_score + parsed.governance_score) / 3;
        return {
          analysis: content,
          score: Math.round(overallScore) || 70,
          confidence: parsed.confidence || 80,
          reasoning: parsed.key_findings || 'ESG analysis completed',
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
    } catch (error) {
      console.error('ESG analysis failed:', error);
      throw new Error(`ESG analysis failed: ${error.message}`);
    }
  }

  private extractScoreFromText(text: string): number {
    // Try to extract a number that looks like a score
    const scoreMatch = text.match(/\b([0-9]{1,3})\b/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1]);
      if (score >= 0 && score <= 100) return score;
      if (score >= 300 && score <= 850) return score; // Credit score range
    }
    return 75; // Default fallback score
  }
}

export const groqService = new GroqAgentService();