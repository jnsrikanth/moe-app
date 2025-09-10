/**
 * Fraud Agent Client - Vertex AI Agent Builder Integration
 * Provides interface to the fraud detection agent deployed on Agent Builder
 */

import { GoogleAuth } from 'google-auth-library';

export interface FraudAgentRequest {
  transactionId: string;
  userId: string;
  amount: number;
  merchantId: string;
  merchantCategory?: string;
  location?: {
    lat: number;
    lng: number;
    country?: string;
  };
  timestamp?: string;
  deviceInfo?: {
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  isNewPayee?: boolean;
  metadata?: Record<string, any>;
}

export interface FraudAssessment {
  fraudProbability: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  riskIndicators: string[];
  recommendedAction: 'Approve' | 'Review' | 'Flag' | 'Block';
  confidence: number;
  reasoning: string;
}

export interface FraudAgentResponse {
  fraudAssessment: FraudAssessment;
  processingTime: number;
  agentVersion: string;
  requestId: string;
  timestamp: string;
}

export interface AgentBuilderConfig {
  projectId: string;
  location: string;
  agentId: string;
  apiEndpoint?: string;
  timeout?: number;
}

export class FraudAgentClient {
  private auth: GoogleAuth;
  private config: AgentBuilderConfig;
  private apiEndpoint: string;

  constructor(config: AgentBuilderConfig) {
    this.config = {
      ...config,
      apiEndpoint: config.apiEndpoint || 'aiplatform.googleapis.com',
      timeout: config.timeout || 30000,
    };

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    // Construct the agent endpoint
    this.apiEndpoint = `https://${this.config.location}-${this.config.apiEndpoint}/v1/projects/${this.config.projectId}/locations/${this.config.location}/agents/${this.config.agentId}`;
  }

  /**
   * Analyze a transaction for fraud using the Agent Builder agent
   */
  async analyzeTransaction(request: FraudAgentRequest): Promise<FraudAgentResponse> {
    const startTime = Date.now();

    try {
      // Get authentication token
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      // Prepare the agent request
      const agentRequest = this.prepareAgentRequest(request);

      // Call the Agent Builder API
      const response = await this.callAgentAPI(agentRequest, accessToken.token!);

      // Parse and validate the response
      const fraudAssessment = this.parseAgentResponse(response);

      return {
        fraudAssessment,
        processingTime: Date.now() - startTime,
        agentVersion: 'v1.0.0',
        requestId: request.transactionId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Fraud agent analysis failed:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Prepare the request for Agent Builder format
   */
  private prepareAgentRequest(request: FraudAgentRequest): any {
    // Format the conversation for the agent
    const userMessage = this.formatUserMessage(request);

    return {
      query: {
        text: userMessage,
        languageCode: 'en',
      },
      queryParams: {
        timeZone: 'UTC',
        sessionEntityTypes: [],
        payload: {
          transactionData: request,
        },
      },
    };
  }

  /**
   * Format the user message for the agent
   */
  private formatUserMessage(request: FraudAgentRequest): string {
    const parts = [
      `Analyze this transaction for fraud:`,
      `Transaction ID: ${request.transactionId}`,
      `User ID: ${request.userId}`,
      `Amount: $${request.amount}`,
      `Merchant: ${request.merchantId}`,
    ];

    if (request.merchantCategory) {
      parts.push(`Merchant Category: ${request.merchantCategory}`);
    }

    if (request.location) {
      parts.push(`Location: ${JSON.stringify(request.location)}`);
    }

    if (request.timestamp) {
      parts.push(`Timestamp: ${request.timestamp}`);
    }

    if (request.deviceInfo) {
      parts.push(`Device Info: ${JSON.stringify(request.deviceInfo)}`);
    }

    if (request.isNewPayee !== undefined) {
      parts.push(`New Payee: ${request.isNewPayee}`);
    }

    return parts.join('\n');
  }

  /**
   * Call the Agent Builder API
   */
  private async callAgentAPI(request: any, token: string): Promise<any> {
    const url = `${this.apiEndpoint}:detectIntent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Agent API call failed: ${response.status} - ${errorBody}`);
    }

    return response.json();
  }

  /**
   * Parse the agent response into structured format
   */
  private parseAgentResponse(response: any): FraudAssessment {
    // Extract the agent's response
    const agentResponse = response.queryResult?.responseMessages?.[0]?.text?.text?.[0];
    
    if (!agentResponse) {
      throw new Error('Invalid agent response format');
    }

    // Try to parse as JSON first (if agent returns structured data)
    try {
      const parsed = JSON.parse(agentResponse);
      return this.validateFraudAssessment(parsed);
    } catch {
      // Fallback to text parsing if not JSON
      return this.parseTextResponse(agentResponse);
    }
  }

  /**
   * Parse text response from agent
   */
  private parseTextResponse(text: string): FraudAssessment {
    // Extract fraud probability
    const probMatch = text.match(/fraud.{0,20}probability[:\s]+(\d+(?:\.\d+)?)/i);
    const fraudProbability = probMatch ? parseFloat(probMatch[1]) : 50;

    // Extract risk level
    const riskMatch = text.match(/risk.{0,10}level[:\s]+(low|medium|high|critical)/i);
    const riskLevel = this.normalizeRiskLevel(riskMatch?.[1] || 'Medium');

    // Extract risk indicators
    const indicators = this.extractRiskIndicators(text);

    // Extract recommended action
    const actionMatch = text.match(/recommend(?:ed)?.{0,10}action[:\s]+(approve|review|flag|block)/i);
    const recommendedAction = this.normalizeAction(actionMatch?.[1] || 'Review');

    // Extract confidence
    const confMatch = text.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    const confidence = confMatch ? parseFloat(confMatch[1]) : 75;

    return {
      fraudProbability,
      riskLevel,
      riskIndicators: indicators,
      recommendedAction,
      confidence,
      reasoning: text.substring(0, 500),
    };
  }

  /**
   * Extract risk indicators from text
   */
  private extractRiskIndicators(text: string): string[] {
    const indicators: string[] = [];
    
    const patterns = [
      /unusually.{0,10}high.{0,10}amount/i,
      /high.{0,10}velocity/i,
      /geographic.{0,10}anomaly/i,
      /suspicious.{0,10}pattern/i,
      /new.{0,10}payee/i,
      /cross.{0,10}border/i,
      /unusual.{0,10}time/i,
      /duplicate.{0,10}transaction/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        indicators.push(pattern.source.replace(/[^a-z\s]/gi, '').trim());
      }
    }

    return indicators;
  }

  /**
   * Normalize risk level to enum value
   */
  private normalizeRiskLevel(level: string): 'Low' | 'Medium' | 'High' | 'Critical' {
    const normalized = level.toLowerCase().trim();
    switch (normalized) {
      case 'low':
        return 'Low';
      case 'high':
        return 'High';
      case 'critical':
        return 'Critical';
      default:
        return 'Medium';
    }
  }

  /**
   * Normalize action to enum value
   */
  private normalizeAction(action: string): 'Approve' | 'Review' | 'Flag' | 'Block' {
    const normalized = action.toLowerCase().trim();
    switch (normalized) {
      case 'approve':
        return 'Approve';
      case 'flag':
        return 'Flag';
      case 'block':
        return 'Block';
      default:
        return 'Review';
    }
  }

  /**
   * Validate fraud assessment structure
   */
  private validateFraudAssessment(data: any): FraudAssessment {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid fraud assessment data');
    }

    return {
      fraudProbability: Math.min(100, Math.max(0, data.fraudProbability || 50)),
      riskLevel: this.normalizeRiskLevel(data.riskLevel || 'Medium'),
      riskIndicators: Array.isArray(data.riskIndicators) ? data.riskIndicators : [],
      recommendedAction: this.normalizeAction(data.recommendedAction || 'Review'),
      confidence: Math.min(100, Math.max(0, data.confidence || 75)),
      reasoning: String(data.reasoning || 'Analysis completed'),
    };
  }

  /**
   * Handle and format errors
   */
  private handleError(error: any): Error {
    if (error instanceof Error) {
      return error;
    }
    
    if (typeof error === 'string') {
      return new Error(error);
    }
    
    return new Error('Unknown error occurred in fraud agent');
  }

  /**
   * Get agent health status
   */
  async getHealth(): Promise<{ status: string; latency: number }> {
    const startTime = Date.now();
    
    try {
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();
      
      const response = await fetch(`${this.apiEndpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken.token!}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        latency: Date.now() - startTime,
      };
    } catch {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
      };
    }
  }
}

// Export a factory function for creating client instances
export function createFraudAgentClient(config: Partial<AgentBuilderConfig>): FraudAgentClient {
  const fullConfig: AgentBuilderConfig = {
    projectId: config.projectId || process.env.GCP_PROJECT_ID!,
    location: config.location || process.env.AGENT_LOCATION || 'us-central1',
    agentId: config.agentId || process.env.FRAUD_AGENT_ID || 'fraud-detection-agent',
    apiEndpoint: config.apiEndpoint,
    timeout: config.timeout,
  };

  return new FraudAgentClient(fullConfig);
}
