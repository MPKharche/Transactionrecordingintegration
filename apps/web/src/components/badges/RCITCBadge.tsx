import { useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { RCITCModal } from "../../features/review/RCITCModal";

interface RCITCBadgeProps {
  reverseChargeApplicable?: boolean;
  itcEligible?: boolean;
  itcIneligibleReason?: string;
}

export function RCITCBadge({
  reverseChargeApplicable,
  itcEligible,
  itcIneligibleReason,
}: RCITCBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const hasRC = reverseChargeApplicable === true;
  const hasITCIssue = itcEligible === false;

  if (!hasRC && !hasITCIssue) {
    return null;
  }

  // Determine variant based on what flags are set
  const variant = hasRC && hasITCIssue ? "both" : hasRC ? "rc" : "itc";

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        title={
          variant === "both"
            ? "Reverse Charge & ITC Ineligible"
            : variant === "rc"
              ? "Reverse Charge Applicable"
              : "ITC Ineligible"
        }
        aria-label={
          variant === "both"
            ? "Reverse Charge & ITC Ineligible - Click for details"
            : variant === "rc"
              ? "Reverse Charge Applicable - Click for details"
              : "ITC Ineligible - Click for details"
        }
      >
        {variant === "both" && (
          <>
            <span className="text-sm">🔄❌</span>
            <span className="hidden sm:inline">RC & ITC</span>
          </>
        )}
        {variant === "rc" && (
          <>
            <RotateCcw size={12} className="text-amber-500" />
            <span className="hidden sm:inline">Reverse Charge</span>
            <span className="sm:hidden">RC</span>
          </>
        )}
        {variant === "itc" && (
          <>
            <AlertCircle size={12} className="text-red-500" />
            <span className="hidden sm:inline">ITC Ineligible</span>
            <span className="sm:hidden">No ITC</span>
          </>
        )}
      </button>

      {showModal && (
        <RCITCModal
          reverseChargeApplicable={reverseChargeApplicable}
          itcEligible={itcEligible}
          itcIneligibleReason={itcIneligibleReason}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
