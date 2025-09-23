import type { AnalysisResult, AIServiceProvider } from './ai-service-base';
import { VertexService } from './vertex-service';
import { LocalService } from './local-service';

export type AIProvider = 'vertex' | 'local';
export { AnalysisResult };

const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'vertex';

export class AIService implements AIServiceProvider {
  private provider: AIProvider = DEFAULT_PROVIDER as AIProvider;
  private vertexFailed = false;
  private lastVertexCheck = 0;
  private readonly VERTEX_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // Service instances
  private vertexService = new VertexService();
  private localService = new LocalService();

  /**
   * Set the AI provider to use
   * @param provider 'vertex' or 'local'
   */
  setProvider(provider: AIProvider) {
    this.provider = provider;
    // Reset vertex failure state when switching providers
    if (provider === 'vertex') {
      this.vertexFailed = false;
      this.lastVertexCheck = 0;
    }
    console.log(`Switching to ${provider} AI provider`);
  }

  /**
   * Get the current AI provider
   */
  getProvider(): AIProvider {
    return this.provider;
  }

  private async shouldUseVertex(): Promise<boolean> {
    // If user explicitly chose local, don't use Vertex
    if (this.provider === 'local') return false;

    // If Vertex is working and we're meant to use it, continue using it
    if (this.provider === 'vertex' && !this.vertexFailed) {
      // Periodically check Vertex connectivity
      const now = Date.now();
      if (now - this.lastVertexCheck > this.VERTEX_CHECK_INTERVAL) {
        const isConnected = await this.testConnection();
        this.vertexFailed = !isConnected;
        this.lastVertexCheck = now;
      }
      return !this.vertexFailed;
    }
    return false;
  }

  async testConnection(): Promise<boolean> {
    if (this.provider === 'local') return true;
    const result = await this.vertexService.testConnection();
    if (!result) {
      console.log('Vertex AI connection failed, will use local models');
      this.vertexFailed = true;
    }
    return result;
  }

  async analyzeCreditApplication(applicationData: any): Promise<AnalysisResult> {
    if (await this.shouldUseVertex()) {
      try {
        return await this.vertexService.analyzeCreditApplication(applicationData);
      } catch (error) {
        console.error('Vertex AI credit analysis failed, falling back to local:', error);
        this.vertexFailed = true;
      }
    }
    return this.localService.analyzeCreditApplication(applicationData);
  }

  async detectFraud(transactionData: any): Promise<AnalysisResult> {
    if (await this.shouldUseVertex()) {
      try {
        return await this.vertexService.detectFraud(transactionData);
      } catch (error) {
        console.error('Vertex AI fraud detection failed, falling back to local:', error);
        this.vertexFailed = true;
      }
    }
    return this.localService.detectFraud(transactionData);
  }

  async analyzeESG(companyData: any): Promise<AnalysisResult> {
    if (await this.shouldUseVertex()) {
      try {
        return await this.vertexService.analyzeESG(companyData);
      } catch (error) {
        console.error('Vertex AI ESG analysis failed, falling back to local:', error);
        this.vertexFailed = true;
      }
    }
    return this.localService.analyzeESG(companyData);
  }
}

export const aiService = new AIService();