export interface AnalysisResult {
  analysis: string;
  score: number;
  confidence: number;
  reasoning: string;
  processingTime: number;
}

export interface AIServiceProvider {
  testConnection(): Promise<boolean>;
  analyzeCreditApplication(applicationData: any): Promise<AnalysisResult>;
  detectFraud(transactionData: any): Promise<AnalysisResult>;
  analyzeESG(companyData: any): Promise<AnalysisResult>;
}