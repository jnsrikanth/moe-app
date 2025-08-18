import { RouterMetrics, SystemLog } from "@/types/moe";
import { useEffect, useRef } from "react";

interface MoERouterProps {
  metrics: RouterMetrics;
  realtimeLogs: SystemLog[];
}

export function MoERouter({ metrics, realtimeLogs }: MoERouterProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [realtimeLogs]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'info': return 'text-gray-300';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border-2 border-blue-400">
      <h3 className="text-xl font-semibold mb-4 flex items-center text-white">
        <div className="w-3 h-3 bg-blue-400 rounded-full mr-2"></div>
        MoE Routing Agent
        <span className="ml-2 px-2 py-1 bg-green-500 text-black text-xs rounded font-bold">Phi-3 Mini (3.8B)</span>
      </h3>

      {/* Real-Time Dialog */}
      <div className="bg-gray-900 rounded-lg p-4 mb-4 h-48 overflow-y-auto border-l-4 border-green-500" ref={logContainerRef}>
        <div className="text-xs text-green-500 font-bold mb-2 flex items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          REAL-TIME ANALYSIS LOG
        </div>
        <div className="space-y-2 text-sm">
          {realtimeLogs.slice(-8).map((log) => (
            <div key={log.id} className={getLogColor(log.level)}>
              <span className="text-blue-400">[{formatTime(log.timestamp)}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>

      {/* Router Metadata */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700 rounded p-4">
          <h4 className="text-sm font-medium mb-3 text-white">Routing Parameters</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Context Size:</span>
              <span className="text-white">{metrics.contextSize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Response Threshold:</span>
              <span className="text-white">{metrics.responseThreshold}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Load Balancing:</span>
              <span className="text-green-500">{metrics.loadBalancing ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Routing Algorithm:</span>
              <span className="text-white">{metrics.routingAlgorithm}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-700 rounded p-4">
          <h4 className="text-sm font-medium mb-3 text-white">Decision Criteria Weights</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Agent Load</span>
              <div className="flex items-center">
                <div className="w-16 bg-gray-600 rounded-full h-1 mr-2">
                  <div className="bg-blue-400 h-1 rounded-full" style={{ width: '40%' }}></div>
                </div>
                <span className="text-white">40%</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Specialization</span>
              <div className="flex items-center">
                <div className="w-16 bg-gray-600 rounded-full h-1 mr-2">
                  <div className="bg-blue-400 h-1 rounded-full" style={{ width: '35%' }}></div>
                </div>
                <span className="text-white">35%</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">Response Time</span>
              <div className="flex items-center">
                <div className="w-16 bg-gray-600 rounded-full h-1 mr-2">
                  <div className="bg-blue-400 h-1 rounded-full" style={{ width: '25%' }}></div>
                </div>
                <span className="text-white">25%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Load Metrics */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-xs text-gray-400">CPU Usage</div>
          <div className="text-lg font-bold text-yellow-400">{metrics.cpuUsage}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Memory</div>
          <div className="text-lg font-bold text-green-500">{metrics.memoryUsage}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Tokens/Min</div>
          <div className="text-lg font-bold text-white">{(metrics.tokensPerMinute / 1000).toFixed(1)}K</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">Queue Depth</div>
          <div className="text-lg font-bold text-orange-400">{metrics.queueDepth}</div>
        </div>
      </div>
    </div>
  );
}
