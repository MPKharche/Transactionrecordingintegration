import { useState, useMemo } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { INR } from "../../lib/format";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { Input } from "../../app/components/ui/input";
import { Checkbox } from "../../app/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "../../app/components/ui/alert-dialog";
import { FileText, Copy, Save, Download, AlertCircle, CheckCircle2, Clock } from "lucide-react";

interface Amendment {
  id: string;
  originalDocId: string;
  originalDocNumber: string;
  reason: string;
  changes: {
    field: string;
    original: string | number;
    amended: string | number;
  }[];
  isSupplementary: boolean;
  status: "pending" | "filed";
  createdAt: string;
  filedAt?: string;
}

const AMENDMENT_REASONS = [
  { value: "qty_wrong", label: "Invoice quantity wrong" },
  { value: "rate_wrong", label: "Tax rate wrong" },
  { value: "gstin_wrong", label: "Party GSTIN wrong" },
  { value: "hsn_wrong", label: "HSN/SAC wrong" },
  { value: "description_wrong", label: "Item description wrong" },
  { value: "amount_wrong", label: "Invoice amount wrong" },
  { value: "other", label: "Other" },
];

export function AmendmentWorkflowScreen({ isDark }: { isDark: boolean }) {
  const { docs } = useAppData();
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState("");
  const [isSupplementary, setIsSupplementary] = useState(false);
  const [changes, setChanges] = useState<{ field: string; original: string; amended: string }[]>([
    { field: "", original: "", amended: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const selectedDoc = useMemo(() => {
    return docs.find((d) => d.id === selectedDocId);
  }, [selectedDocId, docs]);

  const changeFields = [
    { value: "doc_number", label: "Document Number" },
    { value: "doc_date", label: "Document Date" },
    { value: "supplier_name", label: "Supplier Name" },
    { value: "supplier_gstin", label: "Supplier GSTIN" },
    { value: "recipient_name", label: "Recipient Name" },
    { value: "recipient_gstin", label: "Recipient GSTIN" },
    { value: "item_description", label: "Item Description" },
    { value: "hsn_sac", label: "HSN/SAC Code" },
    { value: "quantity", label: "Quantity" },
    { value: "rate", label: "Rate" },
    { value: "taxable_amount", label: "Taxable Amount" },
    { value: "gst_rate", label: "GST Rate %" },
  ];

  function addChangeField() {
    setChanges([...changes, { field: "", original: "", amended: "" }]);
  }

  function removeChangeField(idx: number) {
    setChanges(changes.filter((_, i) => i !== idx));
  }

  function updateChangeField(
    idx: number,
    key: "field" | "original" | "amended",
    value: string
  ) {
    const newChanges = [...changes];
    newChanges[idx][key] = value;
    setChanges(newChanges);
  }

  async function handleCreateAmendment(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedDocId || !selectedReason) {
      toast.error("Please select a document and reason");
      return;
    }

    const validChanges = changes.filter((c) => c.field && c.original && c.amended);
    if (validChanges.length === 0) {
      toast.error("Please add at least one change");
      return;
    }

    if (JSON.stringify(validChanges.map((c) => [c.original, c.amended])).match(/^(.*)(.*)$/)) {
      const hasDifference = validChanges.some((c) => c.original !== c.amended);
      if (!hasDifference) {
        toast.error("Original and amended values must be different");
        return;
      }
    }

    try {
      setSubmitting(true);

      const newAmendment: Amendment = {
        id: Math.random().toString(36).substr(2, 9),
        originalDocId: selectedDocId,
        originalDocNumber: selectedDoc?.doc_number || "",
        reason: selectedReason,
        changes: validChanges.map((c) => ({
          field: changeFields.find((f) => f.value === c.field)?.label || c.field,
          original: c.original,
          amended: c.amended,
        })),
        isSupplementary,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setAmendments((prev) => [newAmendment, ...prev]);

      // Reset form
      setSelectedDocId("");
      setSelectedReason("");
      setIsSupplementary(false);
      setChanges([{ field: "", original: "", amended: "" }]);

      toast.success("Amendment created successfully");
    } catch (error) {
      toast.error("Failed to create amendment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkFiled(id: string) {
    try {
      setAmendments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "filed", filedAt: new Date().toISOString() } : a
        )
      );
      toast.success("Amendment marked as filed");
    } catch (error) {
      toast.error("Failed to update amendment");
    }
  }

  async function handleExportCSV() {
    if (amendments.length === 0) {
      toast.error("No amendments to export");
      return;
    }

    try {
      const csv = [
        ["GSTR-1A Amendment Report"],
        [`Generated: ${new Date().toLocaleString("en-IN")}`],
        [],
        ["Original Doc Number", "Reason", "Supplementary", "Status", "Field Changed", "Original Value", "Amended Value"],
        ...amendments.flatMap((a) =>
          a.changes.map((c, idx) => [
            idx === 0 ? a.originalDocNumber : "",
            idx === 0 ? AMENDMENT_REASONS.find((r) => r.value === a.reason)?.label || a.reason : "",
            idx === 0 ? (a.isSupplementary ? "Yes" : "No") : "",
            idx === 0 ? a.status : "",
            c.field,
            String(c.original),
            String(c.amended),
          ])
        ),
      ]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `amendments_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Amendments exported");
    } catch (error) {
      toast.error("Failed to export amendments");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="Amendment Workflow"
          subtitle="Create and manage GSTR-1A amendments for corrected invoices"
          action={
            amendments.length > 0 && (
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            )
          }
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Create Amendment Form */}
          <Card className="p-6 border-2 border-primary/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Create New Amendment
            </h3>

            <form onSubmit={handleCreateAmendment} className="space-y-6">
              {/* Document Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select Original Document *
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  required
                >
                  <option value="">Choose a confirmed invoice…</option>
                  {docs
                    .filter((d) => d.stage === "locked")
                    .map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.doc_number} - {doc.supplier.name} - {INR(doc.total)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Document Preview */}
              {selectedDoc && (
                <Card className="p-4 bg-muted/50">
                  <p className="text-sm font-medium mb-2">Document Preview</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Number:</span>
                      <p className="font-mono font-medium">{selectedDoc.doc_number}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p>{new Date(selectedDoc.doc_date).toLocaleDateString("en-IN")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span>
                      <p className="font-medium">{INR(selectedDoc.total)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Supplier:</span>
                      <p>{selectedDoc.supplier.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">GSTIN:</span>
                      <p className="font-mono text-xs">{selectedDoc.supplier.gstin}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Reason Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Reason for Amendment *
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  required
                >
                  <option value="">Select reason...</option>
                  {AMENDMENT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Changes */}
              <div>
                <label className="block text-sm font-medium mb-3">
                  Changes Made *
                </label>
                <div className="space-y-3">
                  {changes.map((change, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        value={change.field}
                        onChange={(e) => updateChangeField(idx, "field", e.target.value)}
                        className="px-3 py-2 border border-input rounded-md bg-background text-sm"
                      >
                        <option value="">Select field...</option>
                        {changeFields.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <Input
                        placeholder="Original value"
                        value={change.original}
                        onChange={(e) =>
                          updateChangeField(idx, "original", e.target.value)
                        }
                      />

                      <div className="flex gap-2">
                        <Input
                          placeholder="Amended value"
                          value={change.amended}
                          onChange={(e) =>
                            updateChangeField(idx, "amended", e.target.value)
                          }
                        />
                        {changes.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeChangeField(idx)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addChangeField}
                  >
                    + Add Another Change
                  </Button>
                </div>
              </div>

              {/* Supplementary Checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="supplementary"
                  checked={isSupplementary}
                  onChange={(e) => setIsSupplementary(e.target.checked)}
                />
                <label htmlFor="supplementary" className="text-sm font-medium cursor-pointer">
                  Mark as Supplementary Amendment
                </label>
              </div>

              {/* Submit Button */}
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? "Creating..." : "Create Amendment"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedDocId("");
                    setSelectedReason("");
                    setIsSupplementary(false);
                    setChanges([{ field: "", original: "", amended: "" }]);
                  }}
                >
                  Clear Form
                </Button>
              </div>
            </form>
          </Card>

          {/* Amendments List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Amendments ({amendments.length})
              </h3>
            </div>

            {amendments.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No amendments created yet.
                </p>
              </Card>
            ) : (
              amendments.map((amendment) => (
                <Card key={amendment.id} className="p-5 border-l-4 border-blue-500">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">
                          {amendment.originalDocNumber}
                        </h4>
                        {amendment.isSupplementary && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                            Supplementary
                          </span>
                        )}
                        {amendment.status === "filed" ? (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Filed
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {AMENDMENT_REASONS.find((r) => r.value === amendment.reason)?.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(amendment.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>

                    {amendment.status !== "filed" && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkFiled(amendment.id)}
                        className="gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Mark Filed
                      </Button>
                    )}
                  </div>

                  {/* Changes Table */}
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium">Field</th>
                          <th className="px-3 py-2 text-left font-medium">Original</th>
                          <th className="px-3 py-2 text-left font-medium">Amended</th>
                        </tr>
                      </thead>
                      <tbody>
                        {amendment.changes.map((change, idx) => (
                          <tr key={idx} className="border-b border-border hover:bg-muted/50">
                            <td className="px-3 py-2 font-medium">{change.field}</td>
                            <td className="px-3 py-2 text-red-600 line-through">
                              {String(change.original)}
                            </td>
                            <td className="px-3 py-2 text-green-600 font-medium">
                              {String(change.amended)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
