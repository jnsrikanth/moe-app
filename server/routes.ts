import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { groqService } from "./groq-service";
import { RealMoESystem, ROUTER_MODEL, AGENT_MODELS } from "./real-moe-system";
import { z } from "zod";
import { randomUUID } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // REST API Routes
  app.get("/api/expert-agents", async (req, res) => {
    try {
      const agents = await storage.getExpertAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expert agents" });
    }
  });

  // Manual trigger to run one MoE processing cycle (no background spam)
  app.post("/api/run-moe", async (req, res) => {
    try {
      const payload = (req.body || {}) as Partial<{
        type: string;
        priority: "low" | "medium" | "high";
      }>;

      const requestTypes = [
        'Loan Application - Personal',
        'Insurance Claim - Auto',
        'ESG Investment Report',
        'Credit Card Application',
        'Mortgage Pre-approval',
        'Fraud Alert Investigation',
        'Corporate ESG Assessment',
        'Small Business Loan'
      ];
      const priorities = ['low', 'medium', 'high'] as const;

      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        id: requestId,
        type: payload.type || requestTypes[Math.floor(Math.random() * requestTypes.length)],
        priority: (payload.priority as typeof priorities[number]) || priorities[Math.floor(Math.random() * priorities.length)],
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };

      await realMoESystem.handleNewRequest(newRequest);
      res.json({ status: 'queued', request: newRequest });
    } catch (error: any) {
      console.error('Manual MoE trigger error:', error);
      const status = error?.status === 429 ? 429 : 500;
      res.status(status).json({ status: 'error', message: error?.message || 'Failed to run MoE process' });
    }
  });

  app.get("/api/router-metrics", async (req, res) => {
    try {
      const metrics = await storage.getRouterMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch router metrics" });
    }
  });

  app.get("/api/system-metrics", async (req, res) => {
    try {
      const metrics = await storage.getSystemMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system metrics" });
    }
  });

  app.get("/api/system-logs", async (req, res) => {
    try {
      const logs = await storage.getSystemLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Models endpoint to expose actual router/agent model labels
  app.get("/api/models", async (req, res) => {
    try {
      res.json({
        routerModel: ROUTER_MODEL,
        agents: {
          credit: AGENT_MODELS.credit,
          fraud: AGENT_MODELS.fraud,
          esg: AGENT_MODELS.esg,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model labels" });
    }
  });

  app.get("/api/requests", async (req, res) => {
    try {
      const requests = await storage.getRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Test Groq integration
  app.get("/api/test-groq", async (req, res) => {
    try {
      console.log("Testing Groq connection...");
      const isConnected = await groqService.testConnection();
      
      if (isConnected) {
        res.json({ 
          status: "success", 
          message: "Groq connection successful!",
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({ 
          status: "error", 
          message: "Groq connection failed" 
        });
      }
    } catch (error) {
      console.error("Groq test error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ 
        status: "error", 
        message: msg 
      });
    }
  });

  // Health check endpoint for Railway
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Test credit analysis with real Groq
  app.post("/api/test-credit-analysis", async (req, res) => {
    try {
      const sampleApplication = {
        applicant_name: "John Doe",
        annual_income: 75000,
        credit_history_length: 8,
        existing_debt: 15000,
        employment_status: "Full-time",
        loan_amount: 25000,
        loan_purpose: "Home improvement"
      };

      console.log("Running real credit analysis with Groq...");
      const result = await groqService.analyzeCreditApplication(sampleApplication);
      
      res.json({
        status: "success",
        result,
        sampleData: sampleApplication
      });
    } catch (error) {
      console.error("Credit analysis test error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ 
        status: "error", 
        message: msg 
      });
    }
  });

  // WebSocket Server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const connectedClients = new Set<WebSocket>();

  // Initialize Real MoE System
  function broadcastUpdate(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    connectedClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  const realMoESystem = new RealMoESystem(broadcastUpdate);

  wss.on('connection', (ws: WebSocket) => {
    connectedClients.add(ws);
    
    // Send initial data
    sendInitialData(ws);

    ws.on('close', () => {
      connectedClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      connectedClients.delete(ws);
    });
  });

  async function sendInitialData(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const [agents, routerMetrics, systemMetrics, logs, requests] = await Promise.all([
          storage.getExpertAgents(),
          storage.getRouterMetrics(),
          storage.getSystemMetrics(),
          storage.getSystemLogs(),
          storage.getRequests()
        ]);

        ws.send(JSON.stringify({
          type: 'initial_data',
          data: {
            expertAgents: agents,
            routerMetrics,
            systemMetrics,
            systemLogs: logs,
            requests,
            models: {
              routerModel: ROUTER_MODEL,
              agents: AGENT_MODELS,
            }
          }
        }));
      } catch (error) {
        console.error('Failed to send initial data:', error);
      }
    }
  }

  // Real MoE processing - generates requests and processes them with real AI
  async function generateRealMoERequests() {
    try {
      // Generate realistic request types for BFSI
      const requestTypes = [
        'Loan Application - Personal',
        'Insurance Claim - Auto',
        'ESG Investment Report',
        'Credit Card Application',
        'Mortgage Pre-approval',
        'Fraud Alert Investigation',
        'Corporate ESG Assessment',
        'Small Business Loan'
      ];
      
      const priorities = ['low', 'medium', 'high'] as const;
      
      const requestId = `REQ-${Date.now()}`;
      const newRequest = {
        id: requestId,
        type: requestTypes[Math.floor(Math.random() * requestTypes.length)],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };

      console.log(`🚀 Processing real request: ${newRequest.type} (${requestId})`);
      
      // Process with real MoE system
      await realMoESystem.handleNewRequest(newRequest);
      
    } catch (error) {
      console.error('Error in real MoE processing:', error);
      const msg = error instanceof Error ? error.message : String(error);
      
      // Add error log
      const errorLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: `MoE processing error: ${msg}`,
        source: 'MoE System',
      };
      await storage.addSystemLog(errorLog);
      broadcastUpdate('new_log', errorLog);
    }
  }

  // Update router metrics periodically
  async function updateRouterMetrics() {
    try {
      const currentMetrics = await storage.getRouterMetrics();
      const updates = {
        cpuUsage: Math.max(30, Math.min(90, currentMetrics.cpuUsage + (Math.random() - 0.5) * 10)),
        queueDepth: Math.max(0, Math.min(10, currentMetrics.queueDepth + Math.floor((Math.random() - 0.5) * 3))),
        tokensPerMinute: Math.max(1000, currentMetrics.tokensPerMinute + Math.floor((Math.random() - 0.5) * 500)),
        avgResponseTime: Math.max(1.0, Math.min(5.0, currentMetrics.avgResponseTime + (Math.random() - 0.5) * 0.5)),
      };

      const updatedMetrics = await storage.updateRouterMetrics(updates);
      broadcastUpdate('router_metrics_updated', updatedMetrics);
    } catch (error) {
      console.error('Error updating router metrics:', error);
    }
  }

  // Start real MoE processing
  const enableBackground = process.env.GROQ_ENABLE_BACKGROUND === '1';
  if (enableBackground) {
    console.log('🤖 Background MoE processing ENABLED with Groq Cloud integration...');
    setInterval(generateRealMoERequests, 60000 + Math.random() * 60000); // Every 60-120 seconds
    setInterval(updateRouterMetrics, 10000); // Every 10 seconds
  } else {
    console.log('🛑 Background MoE processing DISABLED (set GROQ_ENABLE_BACKGROUND=1 to enable).');
  }

  return httpServer;
}
