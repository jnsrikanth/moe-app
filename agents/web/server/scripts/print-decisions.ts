#!/usr/bin/env node
import fetch from 'node-fetch';

async function main() {
  const base = process.env.API_BASE || 'http://localhost:3000';
  try {
    const resp = await fetch(`${base}/api/decisions?limit=5`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to fetch decisions:', e);
    process.exit(1);
  }
}

main();
