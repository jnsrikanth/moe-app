import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentRegistryEntry } from "@/types/moe";
import { Link } from "wouter";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export default function Admin() {
  const { subscribe } = useWebSocket();
  const [registry, setRegistry] = useState<AgentRegistryEntry[]>([]);
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<Array<{ t: number; cpu: number; q: number; tpm: number; art: number }>>([]);

  type AnalyticsSummary = {
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    approvals: number;
    declines: number;
    total: number;
  };

  // Queries
  const { data: agentsResp, refetch: refetchAgents } = useQuery<any>({ queryKey: ["/api/expert-agents"], staleTime: 10000 });
  const { data: registryResp, refetch: refetchRegistry } = useQuery<AgentRegistryEntry[]>({ queryKey: ["/api/agents"], staleTime: 10000 });
  const { data: analytics } = useQuery<AnalyticsSummary>({ queryKey: ["/api/analytics/summary"], staleTime: 10000 });
  const { data: datasets, refetch: refetchDatasets } = useQuery<any[]>({ queryKey: ["/api/datasets"], staleTime: 10000 });
  const { data: modelsResp } = useQuery<any>({ queryKey: ["/api/models"], staleTime: 600000 });
  const { data: systemMetrics } = useQuery<any>({ queryKey: ["/api/system-metrics"], staleTime: 5000 });
  const { data: routerMetrics } = useQuery<any>({ queryKey: ["/api/router-metrics"], staleTime: 5000 });
  const { data: routerCfg } = useQuery<any>({ queryKey: ["/api/router-config"], staleTime: 10000 });
  const { data: logsResp } = useQuery<any[]>({ queryKey: ["/api/system-logs"], staleTime: 10000 });
  const { data: requests } = useQuery<any[]>({ queryKey: ["/api/requests"], staleTime: 5000, refetchInterval: 5000 });
  const expertAgents = (agentsResp as any[]) || [];

  useEffect(() => {
    if (registryResp) setRegistry(registryResp as AgentRegistryEntry[]);
  }, [registryResp]);

  useEffect(() => { if (routerCfg) setRouterConfig(routerCfg); }, [routerCfg]);
  useEffect(() => { if (logsResp) setSystemLogs(logsResp); }, [logsResp]);
  // seed history with initial routerMetrics
  useEffect(() => {
    if (routerMetrics) {
      setMetricsHistory((prev) => {
        const next = [...prev, { t: Date.now(), cpu: routerMetrics.cpuUsage, q: routerMetrics.queueDepth, tpm: routerMetrics.tokensPerMinute, art: routerMetrics.avgResponseTime }];
        return next.slice(-120);
      });
    }
  }, [routerMetrics]);

  useEffect(() => {
    const unsub1 = subscribe("registry_updated", (entries: AgentRegistryEntry[]) => setRegistry(entries || []));
    const unsub2 = subscribe("router_config_updated", (cfg: any) => setRouterConfig(cfg));
    const unsub3 = subscribe("router_metrics_updated", (m: any) => {
      setMetricsHistory((prev) => {
        const next = [...prev, { t: Date.now(), cpu: m.cpuUsage, q: m.queueDepth, tpm: m.tokensPerMinute, art: m.avgResponseTime }];
        return next.slice(-120);
      });
    });
    const unsub4 = subscribe("new_log", (l: any) => setSystemLogs((prev) => [l, ...prev].slice(0, 200)));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [subscribe]);

  // Agent registration form state
  const [agentName, setAgentName] = useState("");
  const [agentCaps, setAgentCaps] = useState(""); // comma-separated free-text
  const [agentType, setAgentType] = useState<string>("credit");
  const [agentTypeCustom, setAgentTypeCustom] = useState<string>("");
  const [agentModel, setAgentModel] = useState<string>("");
  const [capabilitiesSelected, setCapabilitiesSelected] = useState<string[]>([]);
  const [routingHints, setRoutingHints] = useState<string>(""); // comma-separated
  const capabilityOptions = [
    "scoring",
    "risk",
    "kyc",
    "fraud",
    "credit",
    "esg",
    "explainability",
    "compliance",
  ];

  // Agent type templates (autofill suggestions)
  const agentTypeOptions = [
    { value: 'credit', label: 'Credit' },
    { value: 'fraud', label: 'Fraud' },
    { value: 'esg', label: 'ESG' },
    { value: 'kyc', label: 'KYC / KYB' },
    { value: 'doc-processing', label: 'Document Processing' },
    { value: 'onboarding', label: 'Customer Onboarding' },
    { value: 'credit-underwriting', label: 'Credit Underwriting' },
    { value: 'pricing-offer', label: 'Pricing & Offer' },
    { value: 'investment-suitability', label: 'Investment Suitability' },
    { value: 'custom', label: 'Custom…' },
  ];

  function applyTemplate(v: string) {
    // Choose a default model hint by type if available
    const defaultModel = (modelsResp?.agents?.[v]) || modelsResp?.routerModel || agentModel || "";
    setAgentModel(String(defaultModel || ""));
    // Autofill capabilities and hints by template
    switch (v) {
      case 'kyc':
        setCapabilitiesSelected(['kyc','compliance']);
        setAgentCaps('risk, explainability');
        setRoutingHints('signal:stage=onboarding, signal:product=account');
        if (!agentName) setAgentName('KYC Agent');
        break;
      case 'doc-processing':
        setCapabilitiesSelected(['compliance']);
        setAgentCaps('ocr, extraction, classification');
        setRoutingHints('signal:doc=pdf, signal:stage=ingest');
        if (!agentName) setAgentName('Document Processing');
        break;
      case 'onboarding':
        setCapabilitiesSelected(['risk']);
        setAgentCaps('identity-proofing, form-fill');
        setRoutingHints('signal:stage=onboarding');
        if (!agentName) setAgentName('Customer Onboarding');
        break;
      case 'credit-underwriting':
        setCapabilitiesSelected(['credit','scoring']);
        setAgentCaps('risk, explainability');
        setRoutingHints('signal:product=loan, signal:stage=underwriting');
        if (!agentName) setAgentName('Credit Underwriting');
        break;
      case 'pricing-offer':
        setCapabilitiesSelected(['credit']);
        setAgentCaps('optimization, personalization');
        setRoutingHints('signal:stage=offer');
        if (!agentName) setAgentName('Pricing & Offer');
        break;
      case 'investment-suitability':
        setCapabilitiesSelected(['esg']);
        setAgentCaps('suitability, profiling');
        setRoutingHints('signal:product=investment');
        if (!agentName) setAgentName('Investment Suitability');
        break;
      case 'credit':
      case 'fraud':
      case 'esg':
        setCapabilitiesSelected([v]);
        setAgentCaps('');
        setRoutingHints('');
        if (!agentName) setAgentName(`${v[0].toUpperCase()}${v.slice(1)} Agent`);
        break;
      default:
        // custom
        setCapabilitiesSelected([]);
        setAgentCaps('');
        setRoutingHints('');
    }
  }

  // Dataset registration form state
  const [dsName, setDsName] = useState("");
  const [dsSource, setDsSource] = useState<"url" | "inline" | "upload">("url");
  const [dsUrl, setDsUrl] = useState("");

  const byType = analytics?.byType || {};
  const byStatus = analytics?.byStatus || {};
  const approvals = analytics?.approvals ?? 0;
  const declines = analytics?.declines ?? 0;
  const total = analytics?.total ?? 0;

  const approvalRate = useMemo(() => (total ? ((approvals / total) * 100).toFixed(1) : "0.0"), [approvals, total]);
  const trendNote = useMemo(() => {
    const last = metricsHistory.slice(-10);
    if (last.length < 2) return "Insufficient data";
    const cpuAvg = last.reduce((s, p) => s + p.cpu, 0) / last.length;
    const qAvg = last.reduce((s, p) => s + p.q, 0) / last.length;
    let msg = [] as string[];
    if (cpuAvg > 80) msg.push("High CPU usage detected");
    if (qAvg > 7) msg.push("Queue depth elevated");
    if (approvals + declines > 0) {
      const rate = (approvals / Math.max(1, approvals + declines)) * 100;
      msg.push(`Approval rate ${rate.toFixed(1)}%`);
    }
    return msg.join(" · ") || "Stable";
  }, [metricsHistory, approvals, declines]);

  // Derive router throughput and per-agent processed counts from requests
  const { routerSeries, routerNow, perAgentSeries, perAgentTotals } = useMemo(() => {
    const result = {
      routerSeries: [] as Array<{ x: string; count: number }>,
      routerNow: 0,
      perAgentSeries: [] as Array<Record<string, any>>, // each point: { x, [agentId]: count }
      perAgentTotals: {} as Record<string, number>,
    };
    if (!requests || requests.length === 0) return result;

    // Bucket by minute
    const byMinute: Record<string, number> = {};
    const byMinuteAgent: Record<string, Record<string, number>> = {};
    const now = Date.now();
    for (const r of requests) {
      // consider processed/completed requests
      if (r.status !== 'completed' && r.status !== 'processing' && r.status !== 'failed') continue;
      const t = new Date(r.timestamp).getTime();
      const minuteKey = new Date(Math.floor(t / 60000) * 60000).toLocaleTimeString();
      byMinute[minuteKey] = (byMinute[minuteKey] || 0) + 1;
      const agents = Array.isArray(r.assignedAgents) ? r.assignedAgents : [];
      for (const a of agents) {
        result.perAgentTotals[a] = (result.perAgentTotals[a] || 0) + 1;
        byMinuteAgent[minuteKey] = byMinuteAgent[minuteKey] || {};
        byMinuteAgent[minuteKey][a] = (byMinuteAgent[minuteKey][a] || 0) + 1;
      }
    }

    // compute routerNow as last minute count
    const lastMinuteKey = new Date(Math.floor(now / 60000) * 60000).toLocaleTimeString();
    result.routerNow = byMinute[lastMinuteKey] || 0;

    // build routerSeries sorted by time of keys
    const entries = Object.entries(byMinute);
    entries.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
    result.routerSeries = entries.map(([x, count]) => ({ x, count }));

    // collect all agent ids present
    const agentIds = new Set<string>();
    Object.values(byMinuteAgent).forEach(map => Object.keys(map).forEach(id => agentIds.add(id)));
    const orderedKeys = Object.keys(byMinuteAgent).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    result.perAgentSeries = orderedKeys.map(x => {
      const point: Record<string, any> = { x };
      Array.from(agentIds).forEach((id) => { point[id] = byMinuteAgent[x]?.[id] || 0; });
      return point;
    });

    return result;
  }, [requests]);

  // Map agent id -> friendly name for legends/lists
  const agentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (registry || []).forEach(a => { map[a.id] = a.name || a.id; });
    return map;
  }, [registry]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Admin: MoE Router Management</h1>
            <p className="text-gray-300">Manage Agents, Datasets, and observe system analytics</p>
          </div>
          <div className="space-x-2">
            <Link href="/"><Button variant="secondary" className="bg-gray-800 border border-gray-700">Back to Dashboard</Button></Link>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Observability - Router Config and Metrics */}
          <section className="col-span-12 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xl font-semibold">Router Observability</h2>
                <div className="text-xs text-gray-400">Live metrics and config</div>
              </div>
              <div className="text-sm text-gray-300">
                Engine: <span className="font-semibold">{routerConfig?.engine || '—'}</span>
                {routerConfig?.latencyP50Ms && <span className="ml-3">P50: {routerConfig.latencyP50Ms.toFixed(0)} ms</span>}
                {routerConfig?.latencyP95Ms && <span className="ml-3">P95: {routerConfig.latencyP95Ms.toFixed(0)} ms</span>}
                {routerConfig?.costEstimatePerDecision && <span className="ml-3">Cost: ${routerConfig.costEstimatePerDecision.toFixed(4)}</span>}
              </div>
            </div>
            {metricsHistory.length < 2 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded p-3 h-32 flex flex-col justify-center">
                  <div className="text-sm text-gray-400">Router CPU %</div>
                  <div className="text-3xl font-bold">{routerMetrics?.cpuUsage ?? '—'}</div>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded p-3 h-32 flex flex-col justify-center">
                  <div className="text-sm text-gray-400">Router Queue Depth</div>
                  <div className="text-3xl font-bold">{routerMetrics?.queueDepth ?? '—'}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded p-3 h-56">
                  <div className="text-sm mb-1">Router CPU %</div>
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={metricsHistory.map(p => ({ ...p, x: new Date(p.t).toLocaleTimeString() }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="x" hide />
                      <YAxis domain={[0, 100]} stroke="#888" />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                      <Legend />
                      <Line type="monotone" dataKey="cpu" stroke="#60a5fa" dot={false} name="CPU%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded p-3 h-56">
                  <div className="text-sm mb-1">Router Queue Depth</div>
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={metricsHistory.map(p => ({ ...p, x: new Date(p.t).toLocaleTimeString() }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="x" hide />
                      <YAxis domain={[0, 15]} stroke="#888" />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                      <Legend />
                      <Line type="monotone" dataKey="q" stroke="#34d399" dot={false} name="Queue" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">Tokens/min</div>
                <div className="text-xl font-semibold">{metricsHistory.at(-1)?.tpm ?? routerMetrics?.tokensPerMinute ?? '—'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">Avg Response Time</div>
                <div className="text-xl font-semibold">{metricsHistory.at(-1)?.art?.toFixed?.(2) ?? routerMetrics?.avgResponseTime?.toFixed?.(2) ?? '—'} s</div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">ML Insights</div>
                <div className="text-sm">{trendNote}</div>
              </div>
            </div>
          </section>

          {/* Router Throughput and Per-Agent Processed */}
          <section className="col-span-12 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Processing Activity</h2>
              <div className="text-sm text-gray-300">Live derived from /api/requests</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded p-3 h-56">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm">Router Throughput (req/min)</div>
                  {routerSeries.length < 2 && <div className="text-xs text-gray-400">No timeseries yet</div>}
                </div>
                {routerSeries.length < 2 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xs text-gray-400">Current</div>
                      <div className="text-4xl font-bold">{routerNow}</div>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={routerSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="x" hide />
                      <YAxis allowDecimals={false} stroke="#888" />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#fbbf24" dot={false} name="req/min" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-700 rounded p-3 h-56">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm">Per-Agent Processed (req/min)</div>
                  {perAgentSeries.length < 2 && <div className="text-xs text-gray-400">No timeseries yet</div>}
                </div>
                {perAgentSeries.length < 2 ? (
                  <div className="h-full overflow-auto pr-1">
                    <div className="space-y-1 text-sm text-gray-300">
                      {Object.keys(perAgentTotals).length === 0 && <div className="text-gray-500">No data</div>}
                      {Object.entries(perAgentTotals).map(([agent, count]) => (
                        <div key={agent} className="flex justify-between"><span>{agent}</span><span className="font-semibold">{count}</span></div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={perAgentSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="x" hide />
                      <YAxis allowDecimals={false} stroke="#888" />
                      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} />
                      <Legend />
                      {(() => {
                        const keys = Object.keys(perAgentSeries[0] || {}).filter(k => k !== 'x');
                        const palette = ['#60a5fa','#34d399','#f472b6','#fbbf24','#a78bfa','#f87171','#4ade80','#22d3ee'];
                        return keys.map((k, idx) => (
                          <Line key={k} type="monotone" dataKey={k} stroke={palette[idx % palette.length]} dot={false} name={agentNameMap[k] || k} />
                        ));
                      })()}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>

          {/* Agents Management */}
          <section className="col-span-12 lg:col-span-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Agent Registry</h2>
              <div className="text-sm text-gray-300">Healthy {registry.filter(r => r.health === 'healthy').length} / {registry.length}</div>
            </div>
            <div className="mb-2 grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <label htmlFor="agent-name" className="block text-xs font-medium text-gray-300 mb-1">Agent Name</label>
                <Input id="agent-name" placeholder="e.g., Risk Scorer" value={agentName} onChange={e => setAgentName(e.target.value)} className="bg-gray-900 border-gray-700 w-full" />
              </div>
              <div>
                <label htmlFor="agent-type" className="block text-xs font-medium text-gray-300 mb-1">Type</label>
                <Select value={agentType} onValueChange={(v) => { setAgentType(v); if (v !== 'custom') { setAgentTypeCustom(''); applyTemplate(v); } }}>
                  <SelectTrigger id="agent-type" className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-gray-700">
                    {agentTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {agentType === 'custom' && (
                <div>
                  <label htmlFor="agent-type-custom" className="block text-xs font-medium text-gray-300 mb-1">Custom Type</label>
                  <Input id="agent-type-custom" placeholder="e.g., kyc-lite" value={agentTypeCustom} onChange={e => setAgentTypeCustom(e.target.value)} className="bg-gray-900 border-gray-700 w-full" />
                </div>
              )}
              <div>
                <label htmlFor="agent-llm" className="block text-xs font-medium text-gray-300 mb-1">LLM</label>
                <Select value={agentModel} onValueChange={(v) => setAgentModel(v)}>
                  <SelectTrigger id="agent-llm" className="bg-gray-900 border-gray-700"><SelectValue placeholder="Select LLM" /></SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-gray-700 max-h-72 overflow-auto">
                    {Object.entries(modelsResp?.agents || {}).map(([k, v]: any) => (
                      <SelectItem key={`${k}-${v}`} value={String(v)}>{String(v)}</SelectItem>
                    ))}
                    {modelsResp?.routerModel && (
                      <SelectItem value={String(modelsResp.routerModel)}>{String(modelsResp.routerModel)} (router)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-300 mb-1">Capabilities</label>
                <div className="flex flex-wrap gap-2">
                  {capabilityOptions.map((cap) => {
                    const active = capabilitiesSelected.includes(cap);
                    return (
                      <button
                        key={cap}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCapabilitiesSelected(prev => prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap])}
                        className={`px-3 py-1 rounded-full border text-xs ${active ? 'bg-blue-600/30 text-blue-300 border-blue-500/50' : 'bg-gray-900 text-gray-300 border-gray-600 hover:bg-gray-800'}`}
                      >
                        {active ? '✓ ' : ''}{cap}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-3">
                <label htmlFor="agent-caps" className="block text-xs font-medium text-gray-300 mb-1">Additional capabilities (comma‑separated)</label>
                <Input id="agent-caps" placeholder="e.g., scoring, explainability" value={agentCaps} onChange={e => setAgentCaps(e.target.value)} className="bg-gray-900 border-gray-700 w-full" />
              </div>
              <div className="md:col-span-3">
                <label htmlFor="agent-hints" className="block text-xs font-medium text-gray-300 mb-1">Routing hints (comma‑separated)</label>
                <Input id="agent-hints" placeholder="e.g., signal:stage=onboarding, signal:product=loan" value={routingHints} onChange={e => setRoutingHints(e.target.value)} className="bg-gray-900 border-gray-700 w-full" />
              </div>
              <div className="flex items-end">
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={async () => {
                    const capsFromChips = capabilitiesSelected.slice();
                    const capsFromFreeText = agentCaps.split(',').map(s => s.trim()).filter(Boolean);
                    const capabilities = Array.from(new Set([
                      ...capsFromChips,
                      ...capsFromFreeText,
                    ].filter(Boolean)));
                    const hints = routingHints.split(',').map(s => s.trim()).filter(Boolean);
                    const finalType = agentType === 'custom' ? (agentTypeCustom || 'custom') : agentType;
                    await apiRequest('POST', '/api/agents/register', {
                      name: agentName || 'New Agent',
                      capabilities,
                      type: finalType,
                      model: agentModel || undefined,
                      routingHints: hints.length ? hints : undefined,
                    });
                    setAgentName(""); setAgentCaps(""); setCapabilitiesSelected([]); setAgentModel(""); setRoutingHints(""); setAgentType('credit'); setAgentTypeCustom("");
                    await refetchRegistry();
                  }}
                >Add Agent</Button>
              </div>
            </div>
            <div className="text-xs text-gray-400 mb-4">
              <div>• Type selects the agent’s primary domain (choose a template or Custom). • LLM associates a preferred model. • Capabilities describe what this agent can do. • Routing hints guide rules-based routing.</div>
            </div>

            {/* Registration preview */}
            <div className="mb-4 bg-black/30 border border-gray-800 rounded p-3">
              <div className="text-xs text-gray-300 mb-1 font-medium">Registration preview</div>
              <pre className="text-xs overflow-auto whitespace-pre-wrap break-words text-gray-300">
{JSON.stringify({
  name: agentName || 'New Agent',
  capabilities: Array.from(new Set([
    ...capabilitiesSelected,
    ...agentCaps.split(',').map(s => s.trim()).filter(Boolean),
  ])),
  type: agentType === 'custom' ? (agentTypeCustom || 'custom') : agentType,
  model: agentModel || undefined,
  routingHints: routingHints.split(',').map(s => s.trim()).filter(Boolean).length ? routingHints.split(',').map(s => s.trim()).filter(Boolean) : undefined,
}, null, 2)}
              </pre>
            </div>

            <div className="space-y-2 max-h-80 overflow-auto pr-1">
              {registry.map(a => (
                <div key={a.id} className="bg-gray-900 border border-gray-700 rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span>{a.name}</span>
                      {a.type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">{a.type}</span>
                      )}
                      {a.model && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">{a.model}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{a.id} • {a.capabilities?.join(', ') || '—'}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div
                      className={`
                        px-3 py-1 rounded-full font-bold tracking-wide uppercase
                        ${a.health === 'healthy'
                          ? 'text-green-300 bg-green-600/20 border border-green-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                          : 'text-red-300 bg-red-600/20 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)]'}
                        text-sm md:text-base
                      `}
                      aria-label={`Agent health: ${a.health}`}
                    >
                      {a.health}
                    </div>
                    <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={async () => {
                      await apiRequest('DELETE', `/api/agents/${a.id}`);
                      await refetchRegistry();
                    }}>Remove</Button>
                  </div>
                </div>
              ))}
              {registry.length === 0 && <div className="text-sm text-gray-400">No agents registered.</div>}
            </div>
          </section>

          {/* Analytics Overview */}
          <section className="col-span-12 lg:col-span-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-3">Analytics</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">Total Requests</div>
                <div className="text-2xl font-bold">{total}</div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">Approvals</div>
                <div className="text-2xl font-bold text-green-400">{approvals}</div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-xs text-gray-400">Declines</div>
                <div className="text-2xl font-bold text-red-400">{declines}</div>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded p-3 mb-3">
              <div className="text-xs text-gray-400 mb-1">Approval Rate</div>
              <div className="text-xl font-semibold">{approvalRate}%</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-sm font-medium mb-2">By Type</div>
                <div className="space-y-1 text-sm text-gray-300">
                  {Object.keys(byType).length === 0 && <div className="text-gray-500">No data</div>}
                  {Object.entries(byType).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{k}</span><span className="font-semibold">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-sm font-medium mb-2">By Status</div>
                <div className="space-y-1 text-sm text-gray-300">
                  {Object.keys(byStatus).length === 0 && <div className="text-gray-500">No data</div>}
                  {Object.entries(byStatus).map(([k, v]) => (
                    <div key={k} className="flex justify-between capitalize"><span>{k}</span><span className="font-semibold">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Dataset registration */}
          <section className="col-span-12 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Datasets</h2>
              <Button variant="outline" className="border-gray-600" onClick={() => refetchDatasets()}>Refresh</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3">
              <Input placeholder="Dataset Name" value={dsName} onChange={e => setDsName(e.target.value)} className="bg-gray-900 border-gray-700" />
              <Select value={dsSource} onValueChange={(v) => setDsSource(v as any)}>
                <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-800 text-white border-gray-700">
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="inline">Inline</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="URL (if source=URL)" value={dsUrl} onChange={e => setDsUrl(e.target.value)} className="bg-gray-900 border-gray-700 md:col-span-2" />
              <Input type="file" accept=".json,.csv,.txt" className="bg-gray-900 border-gray-700" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const arrayBuffer = await file.arrayBuffer();
                // Convert ArrayBuffer -> Base64 without spread (TS target compat)
                const bytes = new Uint8Array(arrayBuffer);
                let binary = "";
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                await apiRequest('POST', '/api/datasets/upload', { name: file.name, contentBase64: base64 });
                await refetchDatasets();
              }} />
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={async () => {
                if (!dsName) return;
                await apiRequest('POST', '/api/datasets/register', { name: dsName, source: dsSource, url: dsUrl || undefined });
                setDsName(""); setDsUrl("");
                await refetchDatasets();
              }}>Register</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(datasets as any[] | undefined)?.map((d: any) => (
                <div key={d.id} className="bg-gray-900 border border-gray-700 rounded p-3">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-gray-400">{d.id} • {d.source}{d.url ? ` • ${d.url}` : ''}</div>
                  <div className="mt-2 flex justify-between text-xs text-gray-300">
                    <span>Records: {d.records ?? '—'}</span>
                    <span>Size: {d.sizeBytes ? `${(d.sizeBytes/1024/1024).toFixed(2)} MB` : '—'}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">Created: {new Date(d.createdAt).toLocaleString()}</div>
                  <div className="mt-2 text-right">
                    <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={async () => {
                      await apiRequest('DELETE', `/api/datasets/${d.id}`);
                      await refetchDatasets();
                    }}>Delete</Button>
                  </div>
                </div>
              ))}
              {(!datasets || (datasets as any[]).length === 0) && (
                <div className="text-sm text-gray-400">No datasets registered.</div>
              )}
            </div>
          </section>

          {/* Logs */}
          <section className="col-span-12 bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">System Logs</h2>
              <Button variant="outline" className="border-gray-600" onClick={() => window.location.reload()}>Refresh</Button>
            </div>
            <div className="max-h-64 overflow-auto space-y-2 pr-1">
              {systemLogs.slice(0, 100).map((l) => (
                <div key={l.id} className="bg-gray-900 border border-gray-700 rounded p-2 text-sm">
                  <div className="text-xs text-gray-500">{new Date(l.timestamp).toLocaleString()} • {l.source}</div>
                  <div className={`font-mono ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-300' : 'text-gray-200'}`}>{l.message}</div>
                </div>
              ))}
              {systemLogs.length === 0 && <div className="text-sm text-gray-400">No logs yet.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
