import { X, AlertCircle } from "lucide-react";

interface RCITCModalProps {
  reverseChargeApplicable?: boolean;
  itcEligible?: boolean;
  itcIneligibleReason?: string;
  onClose: () => void;
}

export function RCITCModal({
  reverseChargeApplicable,
  itcEligible,
  itcIneligibleReason,
  onClose,
}: RCITCModalProps) {
  const hasRC = reverseChargeApplicable === true;
  const hasITCIssue = itcEligible === false;

  if (!hasRC && !hasITCIssue) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <h2 className="font-semibold text-foreground text-sm">
              Reverse Charge & ITC Information
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {hasRC && (
            <div className="space-y-2 pb-4 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span className="text-lg">🔄</span>
                Reverse Charge Applicable
              </h3>
              <div className="space-y-1.5 text-xs text-foreground ml-6">
                <div>
                  <span className="font-medium text-muted-foreground">Reason:</span>
                  <p className="mt-0.5 text-foreground">
                    This invoice qualifies for the reverse charge mechanism. The recipient is responsible for
                    paying GST to the government instead of claiming it from the supplier.
                  </p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Impact on Registration:</span>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-foreground">
                    <li>Must register under reverse charge flow (if not already)</li>
                    <li>GST liability is on recipient (your client)</li>
                    <li>RCM (Reverse Charge Mechanism) rules apply</li>
                    <li>ITC may be claimed under RCM provisions</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Corrective Action:</span>
                  <p className="mt-0.5 text-foreground">
                    1. Verify the supplier registration status on GST portal
                    <br />
                    2. Ensure RCM liability is correctly applied in the registration
                    <br />
                    3. File return under RCM provisions (usually in GSTR-1 with RC flag)
                    <br />
                    4. Consult CA for RCM ITC eligibility rules
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasITCIssue && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span className="text-lg">❌</span>
                ITC Ineligible
              </h3>
              <div className="space-y-1.5 text-xs text-foreground ml-6">
                <div>
                  <span className="font-medium text-muted-foreground">Reason:</span>
                  <p className="mt-0.5 text-foreground">
                    {itcIneligibleReason ||
                      "This invoice does not qualify for Input Tax Credit (ITC) claim."}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Impact:</span>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-foreground">
                    <li>GST paid on this invoice cannot be claimed as ITC</li>
                    <li>Will be excluded from the ITC column in purchase register</li>
                    <li>Affects overall GST credit available for filing</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Corrective Action:</span>
                  <p className="mt-0.5 text-foreground">
                    1. Review the invoice eligibility criteria (GST Act Section 16 & 17)
                    <br />
                    2. If mistakenly marked ineligible, correct the supply type or supplier status
                    <br />
                    3. Exclude from ITC calculation in registers/returns
                    <br />
                    4. Document the reason for exclusion for audit trail
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasRC && hasITCIssue && (
            <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border">
              <p className="text-xs text-foreground">
                <span className="font-medium">Note:</span> Both reverse charge and ITC ineligibility flags are
                set on this invoice. Refer to GST RCM rules for how ITC is allowed under reverse charge.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium border border-border rounded-md text-foreground hover:bg-muted transition-colors"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
