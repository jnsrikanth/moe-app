#!/usr/bin/env node
import fetch from 'node-fetch';

const base = process.env.API_BASE || 'http://localhost:3000';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // 1) Trigger a request
  const type = process.argv[2] || 'Loan Application - Personal';
  console.log(`Submitting request: ${type}`);
  let r = await fetch(`${base}/api/run-moe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  });
  if (!r.ok) {
    console.error('run-moe failed', r.status);
    process.exit(1);
  }
  const { request } = await r.json();
  const requestId = request.id;
  console.log('Request ID:', requestId);

  // 2) Poll decisions for a short while
  let tries = 20;
  while (tries-- > 0) {
    const resp = await fetch(`${base}/api/decisions/${requestId}`);
    if (resp.ok) {
      const decision = await resp.json();
      console.log('Final decision:');
      console.log(JSON.stringify(decision, null, 2));
      process.exit(0);
    }
    await sleep(1000);
  }
  console.error('Decision not available yet. Check logs or increase wait.');
  process.exit(2);
}

run().catch(e => { console.error(e); process.exit(1); });
