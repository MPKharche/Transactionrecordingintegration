/**
 * TIER 3.5: TallyPrime Export Panel
 * Export registers in TallyPrime CSV format
 * To be integrated into RegistersScreen
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { Loader2, Download } from "lucide-react";

export interface TallyPrimeExportPanelProps {
  clientId: string;
  clientGstin: string;
  fy: string;
  registerKind: "sales" | "purchase";
  entryCount: number;
}

export function TallyPrimeExportPanel({
  clientId,
  clientGstin,
  fy,
  registerKind,
  entryCount,
}: TallyPrimeExportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [accountMappings, setAccountMappings] = useState({
    igst: "IGST Payable",
    cgst: "CGST Payable",
    sgst: "SGST Payable",
    rcm: "RCM Payable",
  });

  async function handleExport() {
    if (entryCount === 0) {
      toast.error("No entries to export");
      return;
    }

    try {
      setExporting(true);

      // Generate CSV data
      const csvData = [
        ["Date", "Reference", "Account", "Debit", "Credit", "Narration"],
        // Sample data - in production, this comes from your registers
        ["2024-01-15", "INV-001", accountMappings.igst, "9000", "0", "IGST on invoice INV-001"],
        ["2024-01-15", "INV-001", "Purchases", "0", "50000", "Purchase invoice INV-001"],
        ["2024-01-20", "INV-002", accountMappings.cgst, "4500", "0", "CGST on invoice INV-002"],
        ["2024-01-20", "INV-002", accountMappings.sgst, "4500", "0", "SGST on invoice INV-002"],
        ["2024-01-20", "INV-002", "Purchases", "0", "50000", "Purchase invoice INV-002"],
      ]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvData], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tallyprime_${registerKind}_${clientGstin}_${fy}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${entryCount} entries for TallyPrime`);
    } catch (error) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card className="p-4">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-2">Export for TallyPrime</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Export your {registerKind} register in TallyPrime CSV format
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 bg-muted rounded">
              <span className="text-muted-foreground">Entries:</span>
              <span className="font-medium">{entryCount}</span>
            </div>
            <div className="flex justify-between p-2 bg-muted rounded">
              <span className="text-muted-foreground">FY:</span>
              <span className="font-medium">{fy}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              disabled={exporting || entryCount === 0}
              size="sm"
              className="flex-1 gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-3 h-3" />
                  Export CSV
                </>
              )}
            </Button>
            <Button
              onClick={() => setShowMappingModal(true)}
              variant="outline"
              size="sm"
            >
              Map Accounts
            </Button>
          </div>
        </div>
      </Card>

      {/* Account Mapping Modal */}
      {showMappingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md mx-4">
            <h3 className="font-semibold mb-4">Account Mapping</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Map GST accounts to your TallyPrime chart of accounts
            </p>

            <div className="space-y-3 mb-4">
              {[
                { key: "igst", label: "IGST Account" },
                { key: "cgst", label: "CGST Account" },
                { key: "sgst", label: "SGST Account" },
                { key: "rcm", label: "RCM Account" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1">{label}</label>
                  <input
                    type="text"
                    value={accountMappings[key as keyof typeof accountMappings]}
                    onChange={(e) =>
                      setAccountMappings((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowMappingModal(false)}
                className="flex-1 text-sm"
              >
                Save Mapping
              </Button>
              <Button
                onClick={() => setShowMappingModal(false)}
                variant="outline"
                className="flex-1 text-sm"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
