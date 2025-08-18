import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { groqService } from "./groq-service";
import { RealMoESystem } from "./real-moe-system";
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
      res.status(500).json({ 
        status: "error", 
        message: error.message 
      });
    }
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
      res.status(500).json({ 
        status: "error", 
        message: error.message 
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
            requests
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
      
      // Add error log
      const errorLog = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        message: `MoE processing error: ${error.message}`,
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
  console.log('🤖 Starting Real MoE System with Groq Cloud integration...');
  setInterval(generateRealMoERequests, 12000 + Math.random() * 8000); // Every 12-20 seconds (slower for real processing)
  setInterval(updateRouterMetrics, 5000); // Every 5 seconds

  return httpServer;
}
