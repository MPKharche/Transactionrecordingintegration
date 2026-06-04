/**
 * TIER 3.5: TallyPrime Export
 * Export registers in TallyPrime CSV format
 */

import React, { useState } from "react";
import { Button } from "@ca-suite/ui/button";
import { Card } from "@ca-suite/ui/card";
import { Alert, AlertDescription } from "@ca-suite/ui/alert";
import { Loader2, Download, AlertCircle } from "lucide-react";

export function TallyPrimeExportPanel({ clientId, clientGstin, fy }: { clientId: string; clientGstin: string; fy: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedKind, setSelectedKind] = useState<"sales" | "purchase">("purchase");

  async function handleExport() {
    setExporting(true);
    setError("");

    try {
      const url = `/api/export/tally-prime/${clientId}?kind=${selectedKind}&fy=${fy}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error("Export failed");
      }

      // Download CSV file
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `tally_prime_${selectedKind}_${clientGstin}_${fy}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Export for TallyPrime</h3>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Select Register Type</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="purchase"
                  checked={selectedKind === "purchase"}
                  onChange={(e) => setSelectedKind(e.target.value as "sales" | "purchase")}
                  className="mr-2"
                />
                Purchase Register
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="sales"
                  checked={selectedKind === "sales"}
                  onChange={(e) => setSelectedKind(e.target.value as "sales" | "purchase")}
                  className="mr-2"
                />
                Sales Register
              </label>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            <p>FY: <strong>{fy}</strong></p>
            <p>GSTIN: <strong>{clientGstin}</strong></p>
          </div>

          <Button
            onClick={handleExport}
            disabled={exporting}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>

          <div className="bg-blue-50 p-3 rounded text-sm text-blue-900">
            <p className="font-medium mb-1">CSV Format:</p>
            <p className="font-mono text-xs">Date, Reference, Account, Debit, Credit, Narration</p>
            <p className="mt-2">Includes GST accounts and reverse charge entries</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
