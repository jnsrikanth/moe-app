import { z } from 'zod';

export const CreditAnalyzeRequestSchema = z.object({
  applicant_name: z.string().min(1),
  annual_income: z.number().min(0),
  credit_history_length: z.number().min(0),
  existing_debt: z.number().min(0),
  employment_status: z.string().min(1),
  loan_amount: z.number().min(0),
  loan_purpose: z.string().min(1),
  idempotency_key: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export type CreditAnalyzeRequest = z.infer<typeof CreditAnalyzeRequestSchema>;

export const CreditAnalyzeResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  credit_score: z.number().min(300).max(850).optional(),
  risk_level: z.enum(['Low', 'Medium', 'High']).optional(),
  key_factors: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
  processing_time_ms: z.number().optional(),
  trace_id: z.string().optional(),
  message: z.string().optional()
});

export type CreditAnalyzeResponse = z.infer<typeof CreditAnalyzeResponseSchema>;
