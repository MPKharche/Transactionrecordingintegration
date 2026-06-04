import { useState, useRef } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { INR } from "../../lib/format";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "../../app/components/ui/alert-dialog";
import { Upload, Download, AlertTriangle, Check, Loader2, FileJson } from "lucide-react";

interface RegisterRow {
  date: string;
  docNumber: string;
  partyName: string;
  partyGstin: string;
  amount: number;
  itc: number;
}

interface PortalRow extends RegisterRow {}

interface Mismatch {
  type: "your_only" | "portal_only" | "amount_diff" | "itc_diff";
  yourRow?: RegisterRow;
  portalRow?: PortalRow;
  message: string;
}

export function ITCReconciliationScreen({ isDark }: { isDark: boolean }) {
  const { docs, clients } = useAppData();
  const [yourRegister, setYourRegister] = useState<RegisterRow[]>([]);
  const [portalRegister, setPortalRegister] = useState<PortalRow[]>([]);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [reconcileInProgress, setReconcileInProgress] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());

      // Parse CSV/JSON
      let parsedRows: PortalRow[] = [];
      if (file.name.endsWith(".json")) {
        parsedRows = JSON.parse(text);
      } else {
        // Simple CSV parsing (Date, DocNumber, Party, Amount, ITC)
        parsedRows = lines.slice(1).map((line) => {
          const parts = line.split(",");
          return {
            date: parts[0]?.trim() || "",
            docNumber: parts[1]?.trim() || "",
            partyName: parts[2]?.trim() || "",
            partyGstin: parts[3]?.trim() || "",
            amount: parseFloat(parts[4]?.trim() || "0"),
            itc: parseFloat(parts[5]?.trim() || "0"),
          };
        });
      }

      setPortalRegister(parsedRows);
      toast.success(`Loaded ${parsedRows.length} portal records`);

      // Generate sample your register (from docs)
      const sampleYourRegister: RegisterRow[] = docs.slice(0, 15).map((doc, idx) => ({
        date: doc.doc_date,
        docNumber: doc.doc_number,
        partyName: doc.supplier.name,
        partyGstin: doc.supplier.gstin,
        amount: doc.taxable_amount,
        itc: Math.min(doc.igst + doc.cgst + doc.sgst, doc.taxable_amount * 0.18),
      }));
      setYourRegister(sampleYourRegister);

      // Trigger reconciliation
      setTimeout(() => performReconciliation(sampleYourRegister, parsedRows), 300);
    } catch (error) {
      toast.error(`Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function performReconciliation(your: RegisterRow[], portal: PortalRow[]) {
    setReconcileInProgress(true);
    const newMismatches: Mismatch[] = [];

    // Check for items in your register but not in portal
    for (const yourRow of your) {
      const match = portal.find(
        (p) =>
          p.docNumber === yourRow.docNumber &&
          p.partyGstin === yourRow.partyGstin
      );

      if (!match) {
        newMismatches.push({
          type: "your_only",
          yourRow,
          message: `Invoice ${yourRow.docNumber} in your register but not in portal`,
        });
      } else {
        // Check amount and ITC differences
        if (Math.abs(match.amount - yourRow.amount) > 1) {
          newMismatches.push({
            type: "amount_diff",
            yourRow,
            portalRow: match,
            message: `Amount mismatch for ${yourRow.docNumber}: You have ${INR(yourRow.amount)}, portal has ${INR(match.amount)}`,
          });
        }
        if (Math.abs(match.itc - yourRow.itc) > 1) {
          newMismatches.push({
            type: "itc_diff",
            yourRow,
            portalRow: match,
            message: `ITC mismatch for ${yourRow.docNumber}: You have ${INR(yourRow.itc)}, portal has ${INR(match.itc)}`,
          });
        }
      }
    }

    // Check for items in portal but not in your register
    for (const portalRow of portal) {
      const match = your.find(
        (y) =>
          y.docNumber === portalRow.docNumber &&
          y.partyGstin === portalRow.partyGstin
      );

      if (!match) {
        newMismatches.push({
          type: "portal_only",
          portalRow,
          message: `Invoice ${portalRow.docNumber} in portal but not in your register`,
        });
      }
    }

    setMismatches(newMismatches);
    setShowResults(true);
    setReconcileInProgress(false);
    toast.success(`Reconciliation complete: ${newMismatches.length} mismatches found`);
  }

  async function handleSuggestCorrections() {
    // Auto-correct based on portal data
    const correctedYour = yourRegister.map((row) => {
      const portalMatch = portalRegister.find(
        (p) =>
          p.docNumber === row.docNumber &&
          p.partyGstin === row.partyGstin
      );

      if (portalMatch) {
        return { ...row, amount: portalMatch.amount, itc: portalMatch.itc };
      }
      return row;
    });

    setYourRegister(correctedYour);
    setMismatches([]);
    setShowResults(false);
    toast.success("Corrections applied to your register");
  }

  async function handleGenerateReport() {
    const timestamp = new Date().toISOString().split("T")[0];
    const csv = [
      "Reconciliation Report",
      `Date: ${new Date().toLocaleString("en-IN")}`,
      "",
      "Summary",
      `Total Mismatches: ${mismatches.length}`,
      `Your Records: ${yourRegister.length}`,
      `Portal Records: ${portalRegister.length}`,
      "",
      "Mismatches",
      "Type,Document Number,Message",
      ...mismatches.map((m) => `"${m.type}","${m.yourRow?.docNumber || m.portalRow?.docNumber}","${m.message}"`),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ITC_Reconciliation_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Report downloaded");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="ITC Reconciliation"
          subtitle="Compare your GST register with GSTR-2B from the portal"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Upload Section */}
          {yourRegister.length === 0 && (
            <Card className="p-8 border-2 border-dashed">
              <div className="text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Upload GSTR-2B File</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Download GSTR-2B JSON/CSV from GST portal and upload here to reconcile with your register
                </p>
                <label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileUpload}
                    disabled={loading}
                    className="hidden"
                  />
                  <Button
                    asChild
                    className="cursor-pointer gap-2"
                    disabled={loading}
                  >
                    <span>
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Choose File
                        </>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </Card>
          )}

          {/* Results Section */}
          {showResults && yourRegister.length > 0 && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Your Records</p>
                  <p className="text-2xl font-bold">{yourRegister.length}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Portal Records</p>
                  <p className="text-2xl font-bold">{portalRegister.length}</p>
                </Card>
                <Card className="p-4 border-amber-200 bg-amber-50">
                  <p className="text-sm text-amber-900">Mismatches Found</p>
                  <p className="text-2xl font-bold text-amber-900">{mismatches.length}</p>
                </Card>
              </div>

              {/* Mismatches List */}
              {mismatches.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Mismatches ({mismatches.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr className="border-b border-border">
                          <th className="px-4 py-2 text-left font-medium">Type</th>
                          <th className="px-4 py-2 text-left font-medium">Document</th>
                          <th className="px-4 py-2 text-left font-medium">Your Value</th>
                          <th className="px-4 py-2 text-left font-medium">Portal Value</th>
                          <th className="px-4 py-2 text-left font-medium">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mismatches.map((m, idx) => (
                          <tr key={idx} className="border-b border-border hover:bg-muted/50">
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                m.type === "your_only"
                                  ? "bg-blue-100 text-blue-800"
                                  : m.type === "portal_only"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-amber-100 text-amber-800"
                              }`}>
                                {m.type === "your_only"
                                  ? "Your Only"
                                  : m.type === "portal_only"
                                    ? "Portal Only"
                                    : m.type === "amount_diff"
                                      ? "Amount"
                                      : "ITC"}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {m.yourRow?.docNumber || m.portalRow?.docNumber}
                            </td>
                            <td className="px-4 py-3">
                              {m.yourRow?.amount && (
                                <span>
                                  {INR(m.yourRow.amount)}
                                  {m.type === "itc_diff" && ` (ITC: ${INR(m.yourRow.itc)})`}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {m.portalRow?.amount && (
                                <span>
                                  {INR(m.portalRow.amount)}
                                  {m.type === "itc_diff" && ` (ITC: ${INR(m.portalRow.itc)})`}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-xs">{m.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Comparison Table - Side by Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Your Register */}
                <Card className="overflow-hidden">
                  <div className="p-4 border-b border-border bg-blue-50">
                    <h3 className="font-semibold text-blue-900">Your Register</h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Doc#</th>
                          <th className="px-3 py-2 text-left font-medium">Party</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-right font-medium">ITC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yourRegister.map((row, idx) => (
                          <tr key={idx} className="border-b border-border hover:bg-muted/50">
                            <td className="px-3 py-2">{new Date(row.date).toLocaleDateString("en-IN")}</td>
                            <td className="px-3 py-2 font-mono">{row.docNumber}</td>
                            <td className="px-3 py-2 truncate">{row.partyName}</td>
                            <td className="px-3 py-2 text-right">{INR(row.amount)}</td>
                            <td className="px-3 py-2 text-right">{INR(row.itc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Portal Register */}
                <Card className="overflow-hidden">
                  <div className="p-4 border-b border-border bg-purple-50">
                    <h3 className="font-semibold text-purple-900">Portal GSTR-2B</h3>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Doc#</th>
                          <th className="px-3 py-2 text-left font-medium">Party</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-right font-medium">ITC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portalRegister.map((row, idx) => (
                          <tr key={idx} className="border-b border-border hover:bg-muted/50">
                            <td className="px-3 py-2">{new Date(row.date).toLocaleDateString("en-IN")}</td>
                            <td className="px-3 py-2 font-mono">{row.docNumber}</td>
                            <td className="px-3 py-2 truncate">{row.partyName}</td>
                            <td className="px-3 py-2 text-right">{INR(row.amount)}</td>
                            <td className="px-3 py-2 text-right">{INR(row.itc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleSuggestCorrections}
                  className="gap-2"
                  disabled={mismatches.length === 0}
                >
                  <Check className="w-4 h-4" />
                  Apply Portal Corrections
                </Button>
                <Button
                  onClick={handleGenerateReport}
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Report
                </Button>
                <Button
                  onClick={() => {
                    setYourRegister([]);
                    setPortalRegister([]);
                    setMismatches([]);
                    setShowResults(false);
                  }}
                  variant="outline"
                >
                  Upload Another File
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
