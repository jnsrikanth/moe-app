import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { IncomingRequest } from "@/components/IncomingRequest";
import { MoERouter } from "@/components/MoERouter";
import { ExpertAgents } from "@/components/ExpertAgents";
import { SystemOverview } from "@/components/SystemOverview";
import { DetailedLogs } from "@/components/DetailedLogs";
import { ExpertAgent, Request, RouterMetrics, SystemLog, SystemMetrics } from "@/types/moe";
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

  // Initialize state with fetched data
  useEffect(() => {
    if (initialAgents) setExpertAgents(initialAgents as ExpertAgent[]);
    if (initialRouterMetrics) setRouterMetrics(initialRouterMetrics as RouterMetrics);
    if (initialSystemMetrics) setSystemMetrics(initialSystemMetrics as SystemMetrics);
    if (initialLogs) setSystemLogs(initialLogs as SystemLog[]);
    if (initialRequests) setRequests(initialRequests as Request[]);
    if (initialModels) setModels(initialModels as any);
  }, [initialAgents, initialRouterMetrics, initialSystemMetrics, initialLogs, initialRequests]);

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
        setIsConnected(true);
      }),

      subscribe('agent_updated', (agent: ExpertAgent) => {
        setExpertAgents(prev => prev.map(a => a.id === agent.id ? agent : a));
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
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [subscribe]);

  const currentRequest = requests.find(req => req.status === 'processing') || null;
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
                <div className="text-xs text-gray-400">Active Requests</div>
                <div className="text-xl font-bold text-white">{routerMetrics.activeRequests}</div>
              </div>
              <div className="flex items-center space-x-2">
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
            />
          </div>

          {/* Expert Agents - RIGHT */}
          <div className="col-span-3">
            <ExpertAgents agents={expertAgents} />
          </div>
        </div>

        {/* System Overview */}
        <SystemOverview
          systemMetrics={systemMetrics}
          alerts={alerts}
          models={models}
        />

        {/* Detailed Logs */}
        <DetailedLogs logs={systemLogs} />
      </div>
    </div>
  );
}
