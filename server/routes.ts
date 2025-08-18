import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
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

  // WebSocket Server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const connectedClients = new Set<WebSocket>();

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

  function broadcastUpdate(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    connectedClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Simulate real-time MoE processing
  async function simulateMoEProcessing() {
    try {
      // Add new request to queue
      const requestId = `REQ-${Date.now()}`;
      const requestTypes = ['Loan Application', 'Insurance Claim', 'ESG Report', 'Credit Check'];
      const priorities = ['low', 'medium', 'high'] as const;
      
      const newRequest = {
        id: requestId,
        type: requestTypes[Math.floor(Math.random() * requestTypes.length)],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        status: 'pending' as const,
        timestamp: new Date().toISOString(),
        assignedAgents: [],
      };

      await storage.addRequest(newRequest);
      broadcastUpdate('new_request', newRequest);

      // Add processing log
      const log = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        message: `Processing ${newRequest.type} ${newRequest.id}...`,
        source: 'MoE Router',
      };
      await storage.addSystemLog(log);
      broadcastUpdate('new_log', log);

      // Simulate routing decision
      setTimeout(async () => {
        const agents = await storage.getExpertAgents();
        const selectedAgents = agents.filter(agent => Math.random() > 0.5);
        
        if (selectedAgents.length > 0) {
          const updatedRequest = await storage.updateRequest(requestId, {
            status: 'processing',
            assignedAgents: selectedAgents.map(a => a.id),
          });
          broadcastUpdate('request_updated', updatedRequest);

          // Update agent loads
          for (const agent of selectedAgents) {
            const newLoad = Math.min(100, agent.cpuUsage + Math.random() * 20);
            const shouldScale = newLoad > agent.loadThreshold && !agent.isScaling;
            
            const updatedAgent = await storage.updateExpertAgent(agent.id, {
              cpuUsage: newLoad,
              queueLength: agent.queueLength + 1,
              isScaling: shouldScale,
              instanceCount: shouldScale ? agent.instanceCount + 1 : agent.instanceCount,
            });
            
            broadcastUpdate('agent_updated', updatedAgent);

            if (shouldScale) {
              const scaleLog = {
                id: randomUUID(),
                timestamp: new Date().toISOString(),
                level: 'warning' as const,
                message: `${agent.name} scaling up - load threshold exceeded (${newLoad.toFixed(1)}%)`,
                source: 'Auto-Scaler',
              };
              await storage.addSystemLog(scaleLog);
              broadcastUpdate('new_log', scaleLog);
            }
          }
        }

        // Complete processing after delay
        setTimeout(async () => {
          const completedRequest = await storage.updateRequest(requestId, {
            status: 'completed',
            processingTime: 1.5 + Math.random() * 2,
          });
          broadcastUpdate('request_updated', completedRequest);

          const completionLog = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            level: 'success' as const,
            message: `${newRequest.type} ${requestId} completed successfully`,
            source: 'MoE Router',
          };
          await storage.addSystemLog(completionLog);
          broadcastUpdate('new_log', completionLog);

          // Reduce agent loads
          for (const agentId of completedRequest.assignedAgents) {
            const agent = (await storage.getExpertAgents()).find(a => a.id === agentId);
            if (agent) {
              const newLoad = Math.max(10, agent.cpuUsage - Math.random() * 15);
              const updatedAgent = await storage.updateExpertAgent(agentId, {
                cpuUsage: newLoad,
                queueLength: Math.max(0, agent.queueLength - 1),
                isScaling: newLoad > agent.loadThreshold,
              });
              broadcastUpdate('agent_updated', updatedAgent);
            }
          }
        }, 3000 + Math.random() * 4000);
      }, 1000 + Math.random() * 2000);

    } catch (error) {
      console.error('Error in MoE simulation:', error);
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

  // Start simulations
  setInterval(simulateMoEProcessing, 8000 + Math.random() * 7000); // Every 8-15 seconds
  setInterval(updateRouterMetrics, 5000); // Every 5 seconds

  return httpServer;
}
