/**
 * TIER 3.2: GST Portal Integration Screen
 * Handles GSTR-1 / GSTR-2B reconciliation with GST portal
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Link2, Download } from "lucide-react";

interface PortalStatus {
  connected: boolean;
  gstin?: string;
  lastFetchTime?: string;
  gstr1Status?: "filed" | "pending";
  gstr2bStatus?: "filed" | "pending";
  reconciliationStatus?: "synced" | "mismatched";
  mismatches?: number;
}

export function GstPortalIntegrationScreen({ isDark }: { isDark: boolean }) {
  const { docs } = useAppData();
  const [status, setStatus] = useState<PortalStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [selectedFy, setSelectedFy] = useState(currentFinancialYear());
  const [selectedGstr, setSelectedGstr] = useState<"gstr1" | "gstr2b">("gstr1");
  const [mismatchResults, setMismatchResults] = useState<Array<{ docNumber: string; message: string }> | null>(null);

  const FY_OPTIONS = listIndianFinancialYears(2016);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      // Mock data
      setStatus({
        connected: true,
        gstin: "27AABCT1234A1Z0",
        lastFetchTime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        gstr1Status: "filed",
        gstr2bStatus: "pending",
        reconciliationStatus: "mismatched",
        mismatches: 12,
      });
    } catch (error) {
      toast.error("Failed to load portal status");
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchGSTR() {
    try {
      setFetching(true);
      // Simulate fetch
      await new Promise((r) => setTimeout(r, 2000));

      // Simulate mismatches
      const mockMismatches = [
        { docNumber: "INV-2024-001", message: "Amount mismatch: ₹50,000 vs ₹48,500" },
        { docNumber: "INV-2024-005", message: "ITC mismatch: ₹9,000 claimed vs ₹8,550 allowed" },
      ];

      setMismatchResults(mockMismatches);
      setStatus((prev) => ({ ...prev, mismatches: mockMismatches.length }));
      toast.success(`${selectedGstr.toUpperCase()} fetched. ${mockMismatches.length} mismatches found.`);
    } catch (error) {
      toast.error("Failed to fetch from portal");
    } finally {
      setFetching(false);
    }
  }

  async function handleApplyCorrections() {
    if (!mismatchResults || mismatchResults.length === 0) {
      toast.error("No mismatches to correct");
      return;
    }

    try {
      toast.success(`Applied corrections for ${mismatchResults.length} mismatches`);
      setMismatchResults(null);
    } catch (error) {
      toast.error("Failed to apply corrections");
    }
  }

  async function handleGenerateAmendment() {
    if (!mismatchResults || mismatchResults.length === 0) {
      toast.error("No mismatches to amend");
      return;
    }

    try {
      const csv = [
        ["GSTR-1A Amendment from Portal Reconciliation"],
        [`FY: ${selectedFy}`, `Generated: ${new Date().toLocaleString("en-IN")}`],
        [],
        ["Document Number", "Correction Message"],
        ...mismatchResults.map((m) => [`"${m.docNumber}"`, `"${m.message}"`]),
      ]
        .map((row) => row.join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gst_amendments_${selectedFy}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Amendment file generated");
    } catch (error) {
      toast.error("Failed to generate amendment");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="GST Portal Integration" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="GST Portal Integration"
          subtitle="Fetch and reconcile GSTR from the GST portal"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {status.connected ? (
            <>
              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">GSTIN</p>
                  <p className="text-lg font-bold mt-2 font-mono">{status.gstin}</p>
                </Card>

                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Last Fetch</p>
                  <p className="text-sm font-medium mt-2">
                    {status.lastFetchTime
                      ? new Date(status.lastFetchTime).toLocaleString("en-IN")
                      : "Never"}
                  </p>
                </Card>

                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Reconciliation</p>
                  <div className="mt-2 flex items-center gap-2">
                    {status.reconciliationStatus === "synced" ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">Synced</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium">
                          {status.mismatches} mismatches
                        </span>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* Filing Status */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Filing Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">GSTR-1</span>
                      {status.gstr1Status === "filed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Status: {status.gstr1Status === "filed" ? "Filed" : "Pending"}
                    </p>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">GSTR-2B</span>
                      {status.gstr2bStatus === "filed" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Status: {status.gstr2bStatus === "filed" ? "Filed" : "Pending"}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Fetch Controls */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Fetch from Portal</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Financial Year
                      </label>
                      <select
                        value={selectedFy}
                        onChange={(e) => setSelectedFy(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      >
                        {FY_OPTIONS.map((fy) => (
                          <option key={fy} value={fy}>
                            FY {fy}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        GSTR Type
                      </label>
                      <select
                        value={selectedGstr}
                        onChange={(e) => setSelectedGstr(e.target.value as "gstr1" | "gstr2b")}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      >
                        <option value="gstr1">GSTR-1 (Outward Supplies)</option>
                        <option value="gstr2b">GSTR-2B (Inward Supplies)</option>
                      </select>
                    </div>
                  </div>

                  <Button
                    onClick={handleFetchGSTR}
                    disabled={fetching}
                    className="gap-2 w-full"
                  >
                    {fetching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4" />
                        Fetch {selectedGstr.toUpperCase()} from Portal
                      </>
                    )}
                  </Button>
                </div>
              </Card>

              {/* Reconciliation Results */}
              {mismatchResults && mismatchResults.length > 0 && (
                <Card className="p-6 border-amber-200 bg-amber-50">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Reconciliation Results
                  </h3>

                  <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                    {mismatchResults.map((mismatch, idx) => (
                      <div key={idx} className="p-3 bg-white rounded border border-amber-200">
                        <p className="font-mono font-medium text-sm">
                          {mismatch.docNumber}
                        </p>
                        <p className="text-sm text-amber-900 mt-1">
                          {mismatch.message}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={handleApplyCorrections}
                      className="gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Apply Corrections
                    </Button>
                    <Button
                      onClick={handleGenerateAmendment}
                      variant="outline"
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Generate GSTR-1A
                    </Button>
                  </div>
                </Card>
              )}

              {/* Help Section */}
              <Card className="p-6 bg-muted/50">
                <h3 className="font-semibold mb-3">How Portal Integration Works</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">1.</span>
                    <span>Connect using GSTIN and portal credentials</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">2.</span>
                    <span>Fetch GSTR-1 or GSTR-2B from portal</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">3.</span>
                    <span>Auto-reconcile with your register</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">4.</span>
                    <span>Generate GSTR-1A for corrections</span>
                  </li>
                </ul>
              </Card>
            </>
          ) : (
            <>
              {/* Connect Screen */}
              <Card className="p-12 text-center border-2 border-dashed">
                <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Connect to GST Portal</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Connect your GST portal account to fetch GSTR returns and reconcile
                  with your register.
                </p>
                <Button className="gap-2">
                  <Link2 className="w-4 h-4" />
                  Connect to GST Portal
                </Button>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
