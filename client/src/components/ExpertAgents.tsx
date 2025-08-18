import { ExpertAgent } from "@/types/moe";
import { CreditCard, Shield, Leaf } from "lucide-react";

interface ExpertAgentsProps {
  agents: ExpertAgent[];
}

export function ExpertAgents({ agents }: ExpertAgentsProps) {
  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'credit': return <CreditCard className="text-blue-400 mr-2" size={16} />;
      case 'fraud': return <Shield className="text-red-400 mr-2" size={16} />;
      case 'esg': return <Leaf className="text-green-400 mr-2" size={16} />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'border-green-500';
      case 'overloaded': return 'border-red-500';
      case 'idle': return 'border-gray-500';
      default: return 'border-gray-500';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'processing': return 'bg-green-500 text-black';
      case 'overloaded': return 'bg-red-500 text-white';
      case 'idle': return 'bg-gray-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'processing': return 'bg-green-500 animate-pulse';
      case 'overloaded': return 'bg-red-500 animate-pulse';
      case 'idle': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const renderInstances = (agent: ExpertAgent) => {
    const instances = [];
    for (let i = 0; i < 3; i++) {
      if (i < agent.instanceCount) {
        instances.push(
          <div
            key={i}
            className={`w-4 h-4 rounded ${
              i === agent.instanceCount - 1 && agent.isScaling
                ? 'bg-green-500 opacity-75 animate-pulse border-2 border-green-400'
                : 'bg-green-500'
            }`}
            title={i === agent.instanceCount - 1 && agent.isScaling ? 'Spawning new instance' : 'Active instance'}
          />
        );
      } else {
        instances.push(
          <div key={i} className="w-4 h-4 bg-gray-600 rounded" />
        );
      }
    }
    return instances;
  };

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <div key={agent.id} className={`bg-gray-800 rounded-lg p-4 border ${getStatusColor(agent.status)}`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center text-white">
              {getAgentIcon(agent.type)}
              {agent.name}
            </h4>
            <span className={`px-2 py-1 text-xs rounded font-bold ${getStatusBadgeColor(agent.status)}`}>
              {agent.model}
            </span>
          </div>
          
          {/* Agent Status */}
          <div className="flex items-center mb-3">
            <div className={`w-3 h-3 rounded-full mr-2 ${getStatusDotColor(agent.status)}`}></div>
            <span className={`text-sm font-medium ${
              agent.status === 'processing' ? 'text-green-500' :
              agent.status === 'overloaded' ? 'text-red-500' : 'text-gray-500'
            }`}>
              {agent.status.toUpperCase()}
            </span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 text-xs mb-3">
            <div>
              <div className="text-gray-400">CPU Usage</div>
              <div className={`font-bold ${
                agent.cpuUsage > agent.loadThreshold ? 'text-yellow-400' : 
                agent.cpuUsage > 80 ? 'text-orange-400' : 'text-green-500'
              }`}>
                {agent.cpuUsage}%
              </div>
            </div>
            <div>
              <div className="text-gray-400">Memory</div>
              <div className="text-green-500 font-bold">{agent.memoryUsage}</div>
            </div>
            <div>
              <div className="text-gray-400">Tokens/Min</div>
              <div className="font-bold text-white">{agent.tokensPerMinute}</div>
            </div>
            <div>
              <div className="text-gray-400">Queue</div>
              <div className={`font-bold ${
                agent.queueLength > 3 ? 'text-orange-400' : 
                agent.queueLength > 0 ? 'text-yellow-400' : 'text-green-500'
              }`}>
                {agent.queueLength}
              </div>
            </div>
          </div>

          {/* Instance Scaling */}
          <div className="bg-gray-700 rounded p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Instances:</span>
              <div className="flex space-x-1">
                {renderInstances(agent)}
              </div>
            </div>
            <div className="text-xs mt-1">
              {agent.isScaling ? (
                <span className="text-green-500">Load Threshold: {agent.loadThreshold}% - Scaling Up</span>
              ) : (
                <span className="text-gray-400">Load Threshold: {agent.loadThreshold}% - {
                  agent.cpuUsage < agent.loadThreshold * 0.8 ? 'Healthy' : 'Optimal'
                }</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
