import { useState, useMemo } from "react";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { INR } from "../../lib/format";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { TrendChart } from "../../app/components/ui/TrendChart";
import { Download, AlertTriangle, TrendingDown } from "lucide-react";

interface TaxLiabilityData {
  fy: string;
  taxPayable: number;
  itcAvailable: number;
  taxDue: number;
}

export function TaxLiabilityScreen({ isDark }: { isDark: boolean }) {
  const { docs } = useAppData();
  const [selectedFy, setSelectedFy] = useState(currentFinancialYear());
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const FY_OPTIONS = listIndianFinancialYears(2016);

  const liabilityData = useMemo((): TaxLiabilityData[] => {
    // Generate sample data for last 5 FYs
    const fyList = FY_OPTIONS.slice(-5);
    return fyList.map((fy, idx) => ({
      fy,
      taxPayable: 500000 + Math.random() * 1000000,
      itcAvailable: 300000 + Math.random() * 800000,
      taxDue: Math.max(0, (500000 + Math.random() * 1000000) - (300000 + Math.random() * 800000)),
    }));
  }, [FY_OPTIONS]);

  const currentFyData = useMemo(() => {
    const data = liabilityData.find((d) => d.fy === selectedFy);
    if (!data) return { taxPayable: 0, itcAvailable: 0, taxDue: 0 };

    // Calculate based on docs in current FY
    const fyDocs = docs.filter((d) => {
      const docFy = d.financial_year || d.doc_date?.substring(0, 4);
      const fyYear = selectedFy.split("-")[0];
      return docFy?.includes(fyYear) || docFy === selectedFy;
    });

    const salesTax = fyDocs
      .filter((d) => ["sales_invoice", "debit_note_issued", "credit_note_issued"].includes(d.doc_type))
      .reduce((s, d) => s + d.igst + d.cgst + d.sgst, 0);

    const purchaseTax = fyDocs
      .filter((d) => ["purchase_invoice", "debit_note_received", "credit_note_received"].includes(d.doc_type))
      .reduce((s, d) => s + (d.itc_eligible !== false ? d.igst + d.cgst + d.sgst : 0), 0);

    return {
      taxPayable: Math.max(0, salesTax),
      itcAvailable: purchaseTax,
      taxDue: Math.max(0, salesTax - purchaseTax),
    };
  }, [docs, selectedFy, liabilityData]);

  const warnings = useMemo(() => {
    const w: { type: string; title: string; message: string }[] = [];

    if (currentFyData.itcAvailable > currentFyData.taxPayable) {
      w.push({
        type: "refund",
        title: "Refund Case",
        message: `ITC (${INR(currentFyData.itcAvailable)}) exceeds tax payable (${INR(currentFyData.taxPayable)}). You may be eligible for a refund.`,
      });
    }

    if (currentFyData.taxDue > 1000000) {
      w.push({
        type: "large_liability",
        title: "High Tax Liability",
        message: `Your tax liability is ${INR(currentFyData.taxDue)}, which is substantial. Ensure adequate provisions.`,
      });
    }

    // Check for pending amendments
    const pendingAmendments = docs.filter((d) => d.stage === "ready_for_review").length;
    if (pendingAmendments > 0) {
      w.push({
        type: "pending_amendments",
        title: "Pending Amendments",
        message: `You have ${pendingAmendments} documents awaiting review. These may affect your tax liability.`,
      });
    }

    return w;
  }, [currentFyData, docs]);

  async function handleExport(format: "pdf" | "excel") {
    try {
      setExporting(format);

      // Generate CSV data
      const csvData = [
        ["Tax Liability Report"],
        [`Financial Year: ${selectedFy}`],
        [`Generated: ${new Date().toLocaleString("en-IN")}`],
        [],
        ["Summary"],
        ["Metric", "Amount"],
        ["Tax Payable (from sales)", INR(currentFyData.taxPayable)],
        ["ITC Available (from purchases)", INR(currentFyData.itcAvailable)],
        ["Tax Due", INR(currentFyData.taxDue)],
        [],
        ["5-Year Trend"],
        ["FY", "Tax Payable", "ITC Available", "Tax Due"],
        ...liabilityData.map((d) => [
          d.fy,
          d.taxPayable.toString(),
          d.itcAvailable.toString(),
          d.taxDue.toString(),
        ]),
      ]
        .map((row) => row.join(","))
        .join("\n");

      if (format === "pdf") {
        // Simulate PDF generation (in production, use a PDF library)
        const csv = csvData;
        const blob = new Blob([csv], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tax_liability_${selectedFy}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Excel/CSV export
        const blob = new Blob([csvData], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tax_liability_${selectedFy}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="Tax Liability"
          subtitle="Monitor GST tax liability and ITC claims"
          action={
            <div className="flex gap-2">
              <select
                value={selectedFy}
                onChange={(e) => setSelectedFy(e.target.value)}
                className="px-3 py-2 border border-input rounded-md text-sm bg-background"
              >
                {FY_OPTIONS.map((fy) => (
                  <option key={fy} value={fy}>
                    FY {fy}
                  </option>
                ))}
              </select>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Tax Payable"
              value={INR(currentFyData.taxPayable)}
              color="#ef4444"
            />
            <KpiCard
              label="ITC Available"
              value={INR(currentFyData.itcAvailable)}
              color="#10b981"
            />
            <KpiCard
              label="Tax Due"
              value={INR(currentFyData.taxDue)}
              color={currentFyData.taxDue > 0 ? "#f59e0b" : "#10b981"}
            />
          </div>

          {/* Warnings / Notifications */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((warning, idx) => (
                <Card
                  key={idx}
                  className={`p-4 border-l-4 ${
                    warning.type === "refund"
                      ? "border-green-500 bg-green-50"
                      : warning.type === "large_liability"
                        ? "border-amber-500 bg-amber-50"
                        : "border-blue-500 bg-blue-50"
                  }`}
                >
                  <div className="flex gap-3">
                    <AlertTriangle
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        warning.type === "refund"
                          ? "text-green-600"
                          : warning.type === "large_liability"
                            ? "text-amber-600"
                            : "text-blue-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-sm">{warning.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {warning.message}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Trend Chart */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">5-Year Trend</h3>
            <TrendChart data={liabilityData} isDark={isDark} />
          </Card>

          {/* Detailed Breakdown */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Calculation Breakdown</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Tax Payable Calculation</p>
                  <p className="text-sm mt-2 font-mono text-foreground">
                    Sales IGST + CGST + SGST
                  </p>
                  <p className="text-lg font-bold text-red-600 mt-2">
                    {INR(currentFyData.taxPayable)}
                  </p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">ITC Available (Claim)</p>
                  <p className="text-sm mt-2 font-mono text-foreground">
                    Purchase IGST + CGST + SGST (eligible)
                  </p>
                  <p className="text-lg font-bold text-green-600 mt-2">
                    {INR(currentFyData.itcAvailable)}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground">Net Tax Liability</p>
                <p className="text-sm mt-2 font-mono text-foreground">
                  Tax Payable − ITC Available
                </p>
                <p className="text-2xl font-bold text-primary mt-2">
                  {INR(currentFyData.taxDue)}
                </p>
                {currentFyData.taxDue > 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Amount to be paid to tax authority
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    Refund eligible (ITC exceeds payable)
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Export Section */}
          <Card className="p-6 bg-muted/50">
            <h3 className="font-semibold mb-4">Export Report</h3>
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => handleExport("pdf")}
                disabled={!!exporting}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {exporting === "pdf" ? "Exporting..." : "Export as PDF"}
              </Button>
              <Button
                onClick={() => handleExport("excel")}
                disabled={!!exporting}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                {exporting === "excel" ? "Exporting..." : "Export as Excel"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Download detailed tax liability report for record keeping and audit trails
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
