import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import { CreditAnalyzeRequestSchema, CreditAnalyzeResponseSchema } from './types';
import { analyzeCredit } from './ai';

const app = express();
const log = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.json({ status: 'ready' }));

app.post('/v1/credit/analyze', async (req, res) => {
  try {
    const parsed = CreditAnalyzeRequestSchema.parse(req.body || {});
    const result = await analyzeCredit(parsed);
    const ok = CreditAnalyzeResponseSchema.safeParse(result);
    if (!ok.success) {
      log.warn({ err: ok.error }, 'Response schema validation failed; repairing');
    }
    res.json(result);
  } catch (e: any) {
    log.error({ err: e }, 'credit analyze failed');
    res.status(400).json({ status: 'error', message: e?.message || 'Bad Request' });
  }
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
app.listen(PORT, HOST, () => {
  log.info({ host: HOST, port: PORT }, 'Credit Agent listening');
});
