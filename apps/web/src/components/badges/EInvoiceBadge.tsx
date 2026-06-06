import { CheckCircle, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

export interface EInvoiceBadgeProps {
  /**
   * Whether the e-invoice IRN is valid.
   * - true: valid 64-char hex IRN present
   * - false: IRN present but malformed
   * - null/undefined: no IRN (render nothing)
   */
  isValid: boolean | null;
}

export function EInvoiceBadge({ isValid }: EInvoiceBadgeProps) {
  if (isValid === null || isValid === undefined) {
    return null;
  }

  const isValidEInvoice = isValid === true;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isValidEInvoice
                ? "bg-green-100 text-green-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {isValidEInvoice ? (
              <>
                <CheckCircle size={13} />
                Valid E-Invoice
              </>
            ) : (
              <>
                <AlertCircle size={13} />
                Invalid IRN
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {isValidEInvoice ? (
            <>
              <p className="font-semibold">Valid E-Invoice</p>
              <p className="text-xs">
                This invoice has a valid IRN (Invoice Registration Number) from the GST e-invoice system. The e-invoice number is a 64-character hexadecimal hash used for GST compliance.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Invalid IRN</p>
              <p className="text-xs">
                The IRN provided does not match the expected 64-character hexadecimal format. Please verify the e-invoice number and correct if necessary before confirming the invoice.
              </p>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
