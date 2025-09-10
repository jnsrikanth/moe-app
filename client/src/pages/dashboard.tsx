import { useState, useEffect } from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { IncomingRequest } from "@/components/IncomingRequest";
import { MoERouter } from "@/components/MoERouter";
import { ExpertAgents } from "@/components/ExpertAgents";
import { SystemOverview } from "@/components/SystemOverview";
import { DetailedLogs } from "@/components/DetailedLogs";
import { ExpertAgent, Request, RouterMetrics, SystemLog, SystemMetrics, RouterConfig, RouterEngine, AgentRegistryEntry } from "@/types/moe";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Dashboard() {
  const [expertAgents, setExpertAgents] = useState<ExpertAgent[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [routerMetrics, setRouterMetrics] = useState<RouterMetrics | null>(null);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();
  // Hooks must be declared before any early returns
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedPriority, setSelectedPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [models, setModels] = useState<{ routerModel: string; agents: Record<string, string> } | null>(null);
  const [routerConfig, setRouterConfig] = useState<RouterConfig | null>(null);
  const [registry, setRegistry] = useState<AgentRegistryEntry[]>([]);

  const { isConnected: wsConnected, subscribe } = useWebSocket();

  // Fetch initial data
  const { data: initialAgents } = useQuery({
    queryKey: ['/api/expert-agents'],
    staleTime: 30000,
  });

  const { data: initialRouterMetrics } = useQuery({
    queryKey: ['/api/router-metrics'],
    staleTime: 30000,
  });

  const { data: initialSystemMetrics } = useQuery({
    queryKey: ['/api/system-metrics'],
    staleTime: 30000,
  });

  const { data: initialLogs } = useQuery({
    queryKey: ['/api/system-logs'],
    staleTime: 30000,
  });

  const { data: initialRequests } = useQuery({
    queryKey: ['/api/requests'],
    staleTime: 30000,
  });

  // Fetch models (fallback) in case WS initial_data hasn't arrived yet
  const { data: initialModels } = useQuery({
    queryKey: ['/api/models'],
    staleTime: 60000,
  });

  // Fetch router config (fallback) in case WS initial_data hasn't arrived yet
  const { data: initialRouterConfig } = useQuery({
    queryKey: ['/api/router-config'],
    staleTime: 10000,
  });

  // Fetch registry (fallback)
  const { data: initialRegistry } = useQuery({
    queryKey: ['/api/agents'],
    staleTime: 10000,
  });

  // Initialize state with fetched data
  useEffect(() => {
    if (initialAgents) setExpertAgents(initialAgents as ExpertAgent[]);
    if (initialRouterMetrics) setRouterMetrics(initialRouterMetrics as RouterMetrics);
    if (initialSystemMetrics) setSystemMetrics(initialSystemMetrics as SystemMetrics);
    if (initialLogs) setSystemLogs(initialLogs as SystemLog[]);
    if (initialRequests) setRequests(initialRequests as Request[]);
    if (initialModels) setModels(initialModels as any);
    if (initialRouterConfig) setRouterConfig(initialRouterConfig as RouterConfig);
    if (initialRegistry) setRegistry(initialRegistry as AgentRegistryEntry[]);
  }, [initialAgents, initialRouterMetrics, initialSystemMetrics, initialLogs, initialRequests, initialRouterConfig, initialRegistry]);

  // WebSocket event subscriptions
  useEffect(() => {
    const unsubscribers = [
      subscribe('initial_data', (data) => {
        setExpertAgents(data.expertAgents || []);
        setRouterMetrics(data.routerMetrics);
        setSystemMetrics(data.systemMetrics);
        setSystemLogs(data.systemLogs || []);
        setRequests(data.requests || []);
        if (data.models) setModels(data.models);
        if (data.routerConfig) setRouterConfig(data.routerConfig as RouterConfig);
        if (data.registry) setRegistry(data.registry as AgentRegistryEntry[]);
        setIsConnected(true);
      }),

      subscribe('agent_updated', (agent: ExpertAgent) => {
        setExpertAgents(prev => {
          const exists = prev.some(a => a.id === agent.id);
          return exists ? prev.map(a => (a.id === agent.id ? agent : a)) : [agent, ...prev];
        });
      }),

      subscribe('new_request', (request: Request) => {
        setRequests(prev => [request, ...prev].slice(0, 20));
      }),

      subscribe('request_updated', (updatedRequest: Request) => {
        setRequests(prev => prev.map(r => r.id === updatedRequest.id ? updatedRequest : r));
      }),

      subscribe('router_metrics_updated', (metrics: RouterMetrics) => {
        setRouterMetrics(metrics);
      }),

      subscribe('new_log', (log: SystemLog) => {
        setSystemLogs(prev => [...prev, log].slice(-50));
      }),

      subscribe('router_config_updated', (cfg: RouterConfig) => {
        setRouterConfig(cfg);
      }),

      subscribe('registry_updated', (entries: AgentRegistryEntry[]) => {
        setRegistry(entries || []);
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [subscribe]);

  const currentRequest = requests.find(req => req.status === 'processing') || null;
  // Merge registry-only agents into expertAgents so all show consistent cards/metrics
  const agentsForCards = useMemo(() => {
    const map = new Map(expertAgents.map(a => [a.id, a] as const));
    const merged = [...expertAgents];
    for (const r of registry) {
      if (!map.has(r.id)) {
        merged.push({
          id: r.id,
          name: r.name,
          type: r.type || (r.id.split('-')[0] || 'generic'),
          status: r.health === 'healthy' ? 'idle' : 'overloaded',
          model: r.model || '—',
          parameters: '',
          cpuUsage: r.health === 'healthy' ? 5 : 95,
          memoryUsage: '—',
          tokensPerMinute: 0,
          queueLength: 0,
          instanceCount: 1,
          loadThreshold: 70,
          responseTime: 0,
          isScaling: false,
        });
      }
    }
    return merged;
  }, [expertAgents, registry]);
  // Compute latest FINAL DECISION from logs
  const latestDecisionLog = [...systemLogs].reverse().find(l => l.source === 'MoE Decision' && l.message?.toUpperCase().startsWith('FINAL DECISION'));
  const finalDecision = (() => {
    if (!latestDecisionLog?.message) return null;
    // Expect format: "FINAL DECISION: Approved — rationale"
    const msg = latestDecisionLog.message.replace(/^FINAL DECISION:\s*/i, '');
    const parts = msg.split(/\s+—\s+|\s+-\s+|\s+--\s+/); // support different dashes
    const statusRaw = parts[0]?.trim();
    const rationale = parts.slice(1).join(' — ').trim();
    const status = /approved/i.test(statusRaw) ? 'Approved' : /declined|rejected/i.test(statusRaw) ? 'Declined' : undefined;
    if (!status) return null;
    return { status, rationale } as { status: 'Approved' | 'Declined'; rationale: string };
  })();
  const alerts = [
    {
      id: '1',
      type: 'warning' as const,
      title: 'High Load Detected',
      message: 'Credit Agent scaling up - 3rd instance spawning',
    },
    {
      id: '2',
      type: 'success' as const,
      title: 'Auto-scaling Success',
      message: 'Load balanced across 2 instances',
    },
  ];

  if (!routerMetrics || !systemMetrics) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <Activity className="mx-auto mb-4 animate-spin" size={48} />
          <h2 className="text-xl font-semibold mb-2">Initializing MoE System</h2>
          <p className="text-gray-400">Loading dashboard components...</p>
        </div>
      </div>
    );
  }

  // Manual trigger controls
  const requestTypes = [
    'Loan Application - Personal',
    'Insurance Claim - Auto',
    'ESG Investment Report',
    'Credit Card Application',
    'Mortgage Pre-approval',
    'Fraud Alert Investigation',
    'Corporate ESG Assessment',
    'Small Business Loan',
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <DisclaimerBanner />
      
      <div className="p-6">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-blue-400 mb-2">MoE Routing Agent Dashboard</h1>
              <p className="text-gray-300">BFSI Mixture of Experts - Real-time Agent Monitoring & Analytics</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-gray-800 px-4 py-2 rounded-lg">
                <div className="text-xs text-gray-400">Connection Status</div>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}></div>
                  <span className={`font-medium ${
                    wsConnected ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {wsConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
              <div className="bg-gray-800 px-4 py-2 rounded-lg">
                <div className="text-xs text-gray-400">Routing Engine</div>
                <div className="flex items-center space-x-2">
                  <Select
                    value={(routerConfig?.engine || 'llm') as RouterEngine}
                    onValueChange={async (engine) => {
                      try {
                        const res = await apiRequest('POST', '/api/router-config', { engine });
                        const updated = (await res.json()) as RouterConfig;
                        setRouterConfig(updated);
                        toast({ title: 'Router engine updated', description: `Engine set to ${engine.toUpperCase()}` });
                      } catch (e: any) {
                        toast({ title: 'Failed to update engine', description: e?.message || 'Unknown error', variant: 'destructive' });
                      }
                    }}
                  >
                    <SelectTrigger className="w-[160px] bg-gray-900 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 text-white border-gray-700">
                      <SelectItem value="llm">LLM</SelectItem>
                      <SelectItem value="ml">MLP (Local)</SelectItem>
                      <SelectItem value="rules">Rules</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {routerConfig && (
                  <div className="mt-1 text-xs text-gray-400">
                    <span className={`mr-2 ${routerConfig.modelLoaded ? 'text-green-400' : 'text-yellow-400'}`}>
                      {routerConfig.modelLoaded ? 'Model: Ready' : 'Model: Not Loaded'}
                    </span>
                    {routerConfig.modelVersion && <span>v{routerConfig.modelVersion}</span>}
                    <div className="mt-1 space-x-3">
                      {routerConfig.latencyP50Ms != null && (
                        <span>P50: {routerConfig.latencyP50Ms} ms</span>
                      )}
                      {routerConfig.latencyP95Ms != null && (
                        <span>P95: {routerConfig.latencyP95Ms} ms</span>
                      )}
                      {routerConfig.costEstimatePerDecision != null && (
                        <span>Cost/decision: ${routerConfig.costEstimatePerDecision.toFixed(4)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-gray-800 px-4 py-2 rounded-lg">
                <div className="text-xs text-gray-400">Active Requests</div>
                <div className="text-xl font-bold text-white">{routerMetrics.activeRequests}</div>
              </div>
            <div className="flex items-center space-x-2">
                {/* Stop MOE (scale-to-zero) */}
                <Button
                  variant="secondary"
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600"
                  onClick={async () => {
                    if (!confirm('Stop MOE now and scale Cloud Run services to zero?')) return;
                    try {
                      const resp = await fetch('/api/orchestrator/stop', { method: 'POST' });
                      if (!resp.ok) throw new Error(`Stop failed: ${resp.status}`);
                      toast({ title: 'MOE stopping', description: 'Scaling services to zero…' });
                      // Optional: redirect back to launcher if configured
                      const launcher = (import.meta as any).env?.VITE_LAUNCHER_URL || (window as any).LAUNCHER_URL;
                      if (launcher && confirm('Redirect back to launcher page?')) {
                        window.location.href = launcher;
                      }
                    } catch (e: any) {
                      toast({ title: 'Stop failed', description: e?.message || 'Unknown error', variant: 'destructive' });
                    }
                  }}
                >
                  Stop MOE
                </Button>
                <Select onValueChange={setSelectedType} value={selectedType}>
                  <SelectTrigger className="w-[240px] bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-gray-700">
                    {requestTypes.map((opt) => (
                      <SelectItem key={opt} value={opt} className="focus:bg-gray-700">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(v) => setSelectedPriority(v as 'low' | 'medium' | 'high')} value={selectedPriority}>
                  <SelectTrigger className="w-[150px] bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-gray-700">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={isRunning || !selectedType}
                  onClick={async () => {
                    if (!selectedType) return;
                    setIsRunning(true);
                    try {
                      const res = await apiRequest('POST', '/api/run-moe', { type: selectedType, priority: selectedPriority });
                      toast({ title: 'Request submitted', description: `${selectedType} (${selectedPriority}) queued.` });
                    } catch (e: any) {
                      toast({
                        title: 'Submit failed',
                        description: e?.message || 'Unknown error',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsRunning(false);
                    }
                  }}
                >
                  {isRunning ? 'Submitting…' : 'Submit'}
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Schematic */}
        <div className="grid grid-cols-12 gap-6 mb-8">
          {/* Incoming Request - LEFT */}
          <div className="col-span-3">
            <IncomingRequest
              requests={requests}
              currentRequest={currentRequest}
              requestsPerMinute={systemMetrics.requestsPerMinute}
              avgResponseTime={systemMetrics.avgResponseTime}
              finalDecision={finalDecision}
            />
          </div>

          {/* MoE Router - CENTER */}
          <div className="col-span-6">
            <MoERouter
              metrics={routerMetrics}
              realtimeLogs={systemLogs}
              routerModelLabel={models?.routerModel}
              engine={(routerConfig?.engine || 'llm') as RouterEngine}
              routerConfig={routerConfig}
            />
          </div>

          {/* Expert Agents - RIGHT */}
          <div className="col-span-3">
            {/* Newly Registered Agents (from Agent Registry) */}
            {(() => {
              const canonical = new Set(['credit-agent', 'fraud-agent', 'esg-agent']);
              const extras = registry.filter(r => !canonical.has(r.id));
              if (extras.length === 0) return null;
              return (
                <div className="mb-4 bg-gray-800 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">Registered Agents</h4>
                    <span className="text-xs text-gray-400">{extras.length}</span>
                  </div>
                  <div className="space-y-2">
                    {extras.map(agent => (
                      <div key={agent.id} className="bg-gray-900 rounded p-2 border border-gray-700">
                        <div className="flex items-center justify-between">
                          <div className="truncate mr-2">
                            <div className="text-sm text-white truncate" title={agent.name}>{agent.name}</div>
                            <div className="text-[10px] text-gray-500 truncate" title={agent.id}>ID: {agent.id}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {agent.type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20" title={`Type: ${agent.type}`}>{agent.type}</span>
                            )}
                            {agent.model && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20" title={`Model: ${agent.model}`}>{agent.model}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${agent.health === 'healthy' ? 'bg-green-500/10 text-green-300 border-green-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{agent.health}</span>
                          </div>
                        </div>
                        {agent.routingHints && agent.routingHints.length > 0 && (
                          <div className="mt-1 text-[10px] text-gray-400 truncate" title={agent.routingHints.join(', ')}>
                            Hints: {agent.routingHints.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <ExpertAgents agents={agentsForCards} />
          </div>
        </div>

        {/* System Overview */}
        <SystemOverview
          systemMetrics={systemMetrics}
          alerts={alerts}
          models={models}
        />

        {/* Agent Registry */}
        <div className="mt-8 bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Agent Registry</h3>
            <div className="text-sm text-gray-300">
              {(() => {
                const healthy = registry.filter(r => r.health === 'healthy').length;
                const unhealthy = registry.filter(r => r.health === 'unhealthy').length;
                return (
                  <span>
                    Healthy: <span className="text-green-400 font-medium">{healthy}</span>
                    <span className="mx-2">|</span>
                    Unhealthy: <span className="text-red-400 font-medium">{unhealthy}</span>
                    <span className="mx-2">|</span>
                    Total: <span className="font-medium">{registry.length}</span>
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {registry.map(agent => (
              <div key={agent.id} className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white">{agent.name}</div>
                  <div className={`text-xs px-2 py-0.5 rounded ${agent.health === 'healthy' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{agent.health}</div>
                </div>
                <div className="text-xs text-gray-400 mt-1 break-words">ID: {agent.id}</div>
                <div className="text-xs text-gray-400 mt-1">Capabilities: {agent.capabilities?.length ? agent.capabilities.join(', ') : '—'}</div>
                <div className="text-xs text-gray-500 mt-1">Last seen: {new Date(agent.lastSeen).toLocaleTimeString()}</div>
              </div>
            ))}
            {registry.length === 0 && (
              <div className="text-sm text-gray-400">No agents registered yet.</div>
            )}
          </div>
        </div>

        {/* Detailed Logs */}
        <DetailedLogs logs={systemLogs} />
      </div>
    </div>
  );
}
