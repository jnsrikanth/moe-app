#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const requireCJS = createRequire(import.meta.url);

const execAsync = promisify(exec);

// Port range for our application
const PORT_RANGE = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];
const APP_NAME = 'moe-app';
const PID_FILE = path.join(process.cwd(), '.dev-server.pid');

class DevServerManager {
  constructor() {
    this.currentPort = null;
    this.serverProcess = null;
  }

  async findAvailablePort() {
    console.log('🔍 Finding available port...');
    
    for (const port of PORT_RANGE) {
      try {
        const isAvailable = await this.isPortAvailable(port);
        if (isAvailable) {
          console.log(`✅ Port ${port} is available`);
          return port;
        } else {
          console.log(`❌ Port ${port} is busy`);
        }
      } catch (error) {
        console.log(`⚠️  Error checking port ${port}:`, error.message);
      }
    }
    
    throw new Error(`No available ports in range ${PORT_RANGE[0]}-${PORT_RANGE[PORT_RANGE.length - 1]}`);
  }

  async isPortAvailable(port) {
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      return !stdout.trim(); // If no output, port is available
    } catch (error) {
      // lsof returns non-zero exit code when no processes found (port available)
      return true;
    }
  }

  async killZombieProcesses() {
    console.log('🧟 Checking for zombie processes...');
    
    try {
      // Kill any existing tsx processes running our server
      await execAsync(`pkill -f "tsx server/index.ts" || true`);
      console.log('✅ Cleaned up any existing tsx processes');
      
      // Kill processes on our port range
      for (const port of PORT_RANGE) {
        try {
          const { stdout } = await execAsync(`lsof -ti:${port}`);
          if (stdout.trim()) {
            const pids = stdout.trim().split('\n');
            for (const pid of pids) {
              try {
                await execAsync(`kill -9 ${pid}`);
                console.log(`✅ Killed process ${pid} on port ${port}`);
              } catch (killError) {
                console.log(`⚠️  Could not kill process ${pid}:`, killError.message);
              }
            }
          }
        } catch (error) {
          // No processes on this port, which is good
        }
      }
      
      // Clean up PID file
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
        console.log('✅ Cleaned up PID file');
      }
      
    } catch (error) {
      console.log('⚠️  Error during cleanup:', error.message);
    }
  }

  async updateEnvFile(port) {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add PORT
    if (envContent.includes('PORT=')) {
      envContent = envContent.replace(/PORT=\d+/, `PORT=${port}`);
    } else {
      envContent += `\nPORT=${port}\n`;
    }

    // Ensure HOST is present and set to 0.0.0.0 for CloudPC/proxy-friendly dev
    if (envContent.match(/^HOST=/m)) {
      envContent = envContent.replace(/^HOST=.*/m, `HOST=0.0.0.0`);
    } else {
      envContent += `HOST=0.0.0.0\n`;
    }

    // Trust proxy by default in secure sandbox
    if (envContent.match(/^TRUST_PROXY=/m)) {
      // leave as-is
    } else {
      envContent += `TRUST_PROXY=1\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Updated .env file with PORT=${port}, HOST=0.0.0.0, TRUST_PROXY=1`);
  }

  async startServer(port) {
    console.log(`🚀 Starting MoE server on port ${port}...`);
    
    // Update environment file
    await this.updateEnvFile(port);

    const envBlock = {
      ...process.env,
      PORT: String(port ?? ''),
      HOST: process.env.HOST || '0.0.0.0',
      NODE_ENV: 'development',
      LOG_FILE: process.env.LOG_FILE || '/tmp/moe-app-dev.log'
    };

    // Helper to write PID only when available
    const writePidIfAvailable = (child) => {
      if (typeof child.pid === 'number' && Number.isFinite(child.pid)) {
        try {
          fs.writeFileSync(PID_FILE, child.pid.toString());
        } catch (e) {
          console.warn('⚠️  Could not write PID file:', e?.message || e);
        }
      } else {
        console.warn('⚠️  PID not available; skipping PID file write');
      }
    };

    // Prefer launching tsx directly via Node to avoid npx issues in locked-down envs
    let serverProcess;
    let launched = false;

    const attachCommonHandlers = (child, label) => {
      // Tee stdout/stderr to both console and a log file
      try {
        const logPath = envBlock.LOG_FILE || '/tmp/moe-app-dev.log';
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        child.stdout && child.stdout.on('data', (buf) => {
          try { process.stdout.write(buf); } catch {}
          try { logStream.write(buf); } catch {}
        });
        child.stderr && child.stderr.on('data', (buf) => {
          try { process.stderr.write(buf); } catch {}
          try { logStream.write(buf); } catch {}
        });
        console.log(`📝 Dev logs: ${logPath}`);
      } catch (e) {
        console.warn('⚠️  Could not initialize file logging for dev process:', e?.message || e);
      }

      child.on('spawn', () => {
        launched = true;
        writePidIfAvailable(child);
        this.serverProcess = child;
        this.currentPort = port;
        console.log(`✅ Server started successfully via ${label}!`);
        console.log(`🌐 Frontend: http://localhost:${port}`);
        console.log(`🔌 API: http://localhost:${port}/api`);
        console.log(`🧪 Test Groq: http://localhost:${port}/api/test-groq`);
        console.log(`📊 Dashboard: http://localhost:${port}`);
      });

      child.on('error', (error) => {
        console.error(`❌ Server process error (${label}):`, error?.message || error);
        this.cleanup();
      });

      child.on('exit', (code, signal) => {
        console.log(`🛑 Server process exited (${label}) with code ${code}, signal ${signal}`);
        this.cleanup();
      });
    };

    // Attempt tsx via local bin first (most robust across shells)
    try {
      const isWin = process.platform === 'win32';
      const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');
      if (fs.existsSync(tsxBin)) {
        serverProcess = spawn(tsxBin, ['server/index.ts'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: envBlock,
        });
        attachCommonHandlers(serverProcess, 'tsx bin');
      } else {
        // Resolve tsx CLI entry (ESM) and spawn via current Node
        let tsxEntry;
        try {
          tsxEntry = requireCJS.resolve('tsx/dist/cli.mjs');
        } catch (e1) {
          try {
            tsxEntry = requireCJS.resolve('tsx');
          } catch (e2) {
            tsxEntry = null;
          }
        }
        if (!tsxEntry) throw new Error('tsx CLI not found in local dependencies');
        const nodeCmd = process.execPath; // current Node
        serverProcess = spawn(nodeCmd, [tsxEntry, 'server/index.ts'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: envBlock,
        });
        attachCommonHandlers(serverProcess, 'node tsx');
      }
    } catch (err) {
      if (launched) return serverProcess;
      console.warn('⚠️  Falling back to "npm run dev:direct" (ensure tsx is installed as a devDependency).');
      try {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const fallback = spawn(npmCmd, ['run', 'dev:direct'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: envBlock,
        });
        attachCommonHandlers(fallback, 'npm run dev:direct');
        serverProcess = fallback;
      } catch (fallbackErr) {
        console.error('❌ Fallback launch failed:', fallbackErr?.message || fallbackErr);
        throw fallbackErr;
      }
    }

    return serverProcess;
  }

  cleanup() {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  }

  async handleShutdown() {
    console.log('\n🛑 Shutting down server...');
    
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      
      // Give it 5 seconds to shut down gracefully
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          console.log('⚡ Force killing server process...');
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    this.cleanup();
    process.exit(0);
  }

  async start() {
    try {
      console.log(`🤖 Starting ${APP_NAME} Development Server`);
      console.log('=' .repeat(50));
      
      // Clean up any zombie processes
      await this.killZombieProcesses();
      
      // Wait a moment for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find available port
      const port = await this.findAvailablePort();
      
      // Start server
      await this.startServer(port);
      
    } catch (error) {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }
}

// Handle shutdown signals
const devServer = new DevServerManager();

process.on('SIGINT', () => devServer.handleShutdown());
process.on('SIGTERM', () => devServer.handleShutdown());
process.on('exit', () => devServer.cleanup());

// Start the server
devServer.start();