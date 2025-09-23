import { AnalysisResult } from './ai-service';
import * as natural from 'natural';
import { BayesClassifier } from 'natural';

// Simple classifiers for each task
const creditClassifier = new BayesClassifier();
const fraudClassifier = new BayesClassifier();
const esgClassifier = new BayesClassifier();
const routerClassifier = new BayesClassifier();

// Train classifiers with basic rules
function initializeClassifiers() {
  // Credit classifier training data
  creditClassifier.addDocument('high income good credit history', 'high');
  creditClassifier.addDocument('stable employment low debt', 'high');
  creditClassifier.addDocument('low income high debt', 'low');
  creditClassifier.addDocument('unemployed bad credit', 'low');
  creditClassifier.train();

  // Fraud classifier training data
  fraudClassifier.addDocument('normal transaction pattern regular merchant', 'safe');
  fraudClassifier.addDocument('usual location expected amount', 'safe');
  fraudClassifier.addDocument('unusual location high amount', 'fraud');
  fraudClassifier.addDocument('multiple transactions short time', 'fraud');
  fraudClassifier.train();

  // ESG classifier training data
  esgClassifier.addDocument('renewable energy sustainable practices', 'high');
  esgClassifier.addDocument('environmental protection social responsibility', 'high');
  esgClassifier.addDocument('high emissions poor governance', 'low');
  esgClassifier.addDocument('social issues environmental concerns', 'low');
  esgClassifier.train();

  // Router classifier training data
  routerClassifier.addDocument('loan application credit score', 'credit');
  routerClassifier.addDocument('suspicious transaction fraud check', 'fraud');
  routerClassifier.addDocument('company sustainability rating', 'esg');
  routerClassifier.train();
}

// Initialize on module load
initializeClassifiers();

class LocalAIService {
  constructor() {
    this.name = 'local-lightweight';
  }

  async testConnection(): Promise<boolean> {
    return true; // Local models are always available
  }

  async analyzeCreditApplication(applicationData: any): Promise<AnalysisResult> {
    const textToAnalyze = this.objectToText(applicationData);
    const classification = creditClassifier.classify(textToAnalyze);
    
    const score = classification === 'high' ? 750 : 550;
    const confidence = 0.7; // Lower confidence than cloud models

    return {
      analysis: `Credit analysis based on local model: ${classification}`,
      score,
      confidence: confidence * 100,
      reasoning: `Simple rule-based analysis using lightweight NLP`,
      processingTime: 100 // Local processing is fast
    };
  }

  async detectFraud(transactionData: any): Promise<AnalysisResult> {
    const textToAnalyze = this.objectToText(transactionData);
    const classification = fraudClassifier.classify(textToAnalyze);
    
    const score = classification === 'fraud' ? 80 : 20;
    const confidence = 0.65; // Lower confidence than cloud models

    return {
      analysis: `Fraud analysis based on local model: ${classification}`,
      score,
      confidence: confidence * 100,
      reasoning: `Basic pattern matching using lightweight classifier`,
      processingTime: 100
    };
  }

  async analyzeESG(companyData: any): Promise<AnalysisResult> {
    const textToAnalyze = this.objectToText(companyData);
    const classification = esgClassifier.classify(textToAnalyze);
    
    const score = classification === 'high' ? 85 : 45;
    const confidence = 0.6; // Lower confidence than cloud models

    return {
      analysis: `ESG analysis based on local model: ${classification}`,
      score,
      confidence: confidence * 100,
      reasoning: `Simple ESG assessment using basic NLP`,
      processingTime: 100
    };
  }

  async routeQuery(query: string): Promise<string> {
    return routerClassifier.classify(query);
  }

  private objectToText(obj: any): string {
    return Object.entries(obj)
      .map(([key, value]) => `${key} ${value}`)
      .join(' ')
      .toLowerCase();
  }
}

export const localAIService = new LocalAIService();