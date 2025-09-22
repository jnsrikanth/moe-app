#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'path';
import fs from 'fs';

const outdir = 'dist-server';
if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

const tscPath = path.resolve('node_modules', 'typescript', 'bin', 'tsc');
const project = path.resolve('tsconfig.server.json');

const res = spawnSync(process.execPath, [tscPath, '-p', project], { stdio: 'inherit' });
if (res.status !== 0) {
  console.error('Build failed');
  process.exit(res.status || 1);
}
console.log('Built server to dist-server/');
