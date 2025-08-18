import { SystemLog } from "@/types/moe";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

interface DetailedLogsProps {
  logs: SystemLog[];
}

export function DetailedLogs({ logs }: DetailedLogsProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'info': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const exportLogs = () => {
    const logData = logs.map(log => 
      `[${formatTime(log.timestamp)}] ${log.level.toUpperCase()} [${log.source}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moe_system_logs_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center text-white">
          <FileText className="text-blue-400 mr-2" size={20} />
          Detailed System Logs
        </h3>
        <Button
          onClick={exportLogs}
          variant="outline"
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 border-blue-500 text-white"
        >
          <Download className="mr-2" size={16} />
          Export Logs
        </Button>
      </div>
      
      <div 
        ref={logContainerRef}
        className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm"
      >
        <div className="space-y-1">
          {logs.length > 0 ? (
            logs.slice(-20).map((log) => (
              <div key={log.id} className={getLogColor(log.level)}>
                [{formatTime(log.timestamp)}] [{log.source}] {log.message}
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-center py-4">
              No logs available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
