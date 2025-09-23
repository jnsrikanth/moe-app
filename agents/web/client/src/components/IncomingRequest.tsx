import { Request } from "@/types/moe";

interface IncomingRequestProps {
  requests: Request[];
  currentRequest: Request | null;
  requestsPerMinute: number;
  avgResponseTime: number;
  finalDecision?: { status: 'Approved' | 'Declined'; rationale: string } | null;
}

export function IncomingRequest({ requests, currentRequest, requestsPerMinute, avgResponseTime, finalDecision }: IncomingRequestProps) {
  const queuedRequests = requests.filter(req => req.status === 'pending').slice(0, 3);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold mb-4 flex items-center text-white">
        <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
        Incoming Request
      </h3>
      
      {/* Current Request Display */}
      {currentRequest && (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <div className="text-xs text-gray-400 mb-2">ACTIVE REQUEST</div>
          <div className="text-sm font-medium mb-2 text-white">{currentRequest.type} #{currentRequest.id}</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Priority:</span>
            <span className={`font-medium ${getPriorityColor(currentRequest.priority)}`}>
              {currentRequest.priority.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-gray-400">Type:</span>
            <span className="text-blue-400 font-medium">{currentRequest.type}</span>
          </div>
          {finalDecision && (
            <div className="mt-3">
              <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                finalDecision.status === 'Approved' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
              }`}>
                FINAL DECISION: {finalDecision.status}
              </div>
              <div className="mt-1 text-xs text-gray-300">{finalDecision.rationale}</div>
            </div>
          )}
        </div>
      )}

      {/* Last Decision (when no active request) */}
      {!currentRequest && finalDecision && (
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <div className="text-xs text-gray-400 mb-2">LAST DECISION</div>
          <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
            finalDecision.status === 'Approved' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            FINAL DECISION: {finalDecision.status}
          </div>
          <div className="mt-1 text-xs text-gray-300">{finalDecision.rationale}</div>
        </div>
      )}

      {/* Request Queue */}
      <div className="space-y-2">
        <div className="text-xs text-gray-400 mb-2">REQUEST QUEUE</div>
        {queuedRequests.length > 0 ? (
          queuedRequests.map((request) => (
            <div key={request.id} className="bg-gray-900 rounded p-2 text-xs">
              <div className="font-medium text-white">{request.type} #{request.id}</div>
              <div className="text-gray-400">
                {request.type} • <span className={getPriorityColor(request.priority)}>
                  {request.priority.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-gray-900 rounded p-2 text-xs text-gray-500 text-center">
            No requests in queue
          </div>
        )}
      </div>

      {/* Request Metrics */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-gray-400">Requests/Min</div>
            <div className="text-lg font-bold text-white">{requestsPerMinute.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-gray-400">Avg Response</div>
            <div className="text-lg font-bold text-white">{avgResponseTime.toFixed(1)}s</div>
          </div>
        </div>
      </div>
    </div>
  );
}
