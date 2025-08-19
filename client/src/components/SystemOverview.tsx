import { SystemMetrics } from "@/types/moe";
import { TrendingUp, Cpu, AlertTriangle, Bell } from "lucide-react";

type ModelsInfo = { routerModel: string; agents: Record<string, string> };

interface SystemOverviewProps {
  systemMetrics: SystemMetrics;
  alerts: Array<{
    id: string;
    type: 'warning' | 'success' | 'info';
    title: string;
    message: string;
  }>;
  models?: ModelsInfo | null;
}

export function SystemOverview({ systemMetrics, alerts, models }: SystemOverviewProps) {
  return (
    <div className="grid grid-cols-3 gap-6 mb-8">
      {/* Performance Analytics */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center text-white">
          <TrendingUp className="text-blue-400 mr-2" size={20} />
          Performance Analytics
        </h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Overall Throughput</span>
            <span className="text-green-500 font-bold">{systemMetrics.throughput} req/hr</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Avg Response Time</span>
            <span className="text-blue-400 font-bold">{systemMetrics.avgResponseTime}s</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Success Rate</span>
            <span className="text-green-500 font-bold">{systemMetrics.successRate}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Error Rate</span>
            <span className="text-orange-400 font-bold">{systemMetrics.errorRate}%</span>
          </div>
        </div>
      </div>

      {/* Model Information */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center text-white">
          <Cpu className="text-blue-400 mr-2" size={20} />
          Model Specifications
        </h3>
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-400">Router Model</div>
            <div className="font-medium text-white">{models?.routerModel ?? '—'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Expert Models</div>
            {models?.agents ? (
              <ul className="text-white text-sm list-disc list-inside space-y-1">
                {Object.entries(models.agents).map(([agentType, model]) => (
                  <li key={agentType} className="font-medium">
                    {agentType}: <span className="text-gray-300">{model}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-400 text-sm">—</div>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-400">Notes</div>
            <div className="text-xs text-gray-400">Models reflect live backend configuration.</div>
          </div>
        </div>
      </div>

      {/* Real-time Alerts */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center text-white">
          <Bell className="text-blue-400 mr-2" size={20} />
          System Alerts
        </h3>
        <div className="space-y-3">
          {alerts.length > 0 ? (
            alerts.slice(0, 2).map((alert) => (
              <div
                key={alert.id}
                className={`border-l-4 p-3 rounded ${
                  alert.type === 'warning' ? 'bg-yellow-900 border-yellow-400' :
                  alert.type === 'success' ? 'bg-green-900 border-green-500' :
                  'bg-blue-900 border-blue-400'
                }`}
              >
                <div className="flex items-center">
                  {alert.type === 'warning' ? (
                    <AlertTriangle className="text-yellow-400 mr-2" size={16} />
                  ) : (
                    <Bell className="text-green-500 mr-2" size={16} />
                  )}
                  <div>
                    <div className="text-sm font-medium text-white">{alert.title}</div>
                    <div className="text-xs text-gray-300">{alert.message}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-400 text-sm text-center py-4">
              No active alerts
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
