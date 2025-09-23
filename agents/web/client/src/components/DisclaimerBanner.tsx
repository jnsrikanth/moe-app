import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="bg-red-600 border-l-4 border-red-800 p-4 mb-6">
      <div className="flex items-center">
        <AlertTriangle className="text-yellow-300 text-xl mr-3" />
        <div>
          <h4 className="text-lg font-bold text-white">PROOF OF CONCEPT - TECHNOLOGY DEMONSTRATION ONLY</h4>
          <p className="text-red-100 text-sm mt-1">This system uses fictitious data and non-proprietary datasets for demonstration purposes. Not for production use.</p>
        </div>
      </div>
    </div>
  );
}
