import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Client } from "@ca-suite/shared";
import { useAutoFillClient } from "./hooks/useAutoFillClient";
import { PartySection } from "./components/PartySection";
import { PartySearchDropdown } from "./components/PartySearchDropdown";
import { LineItemsTableEnhanced } from "./components/LineItemsTableEnhanced";
import { GSTCalculatorEnhanced } from "./components/GSTCalculatorEnhanced";
import { AttachmentUpload } from "./components/AttachmentUpload";
import { toast } from "sonner";
import { api, currentFinancialYear } from "../../lib/api";

type DocType =
  | "purchase_invoice"
  | "sales_invoice"
  | "credit_note_issued"
  | "credit_note_received"
  | "debit_note_issued"
  | "debit_note_received";

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "sales_invoice", label: "Sales Invoice" },
  { value: "credit_note_received", label: "Credit Note Received" },
  { value: "credit_note_issued", label: "Credit Note Issued" },
  { value: "debit_note_received", label: "Debit Note Received" },
  { value: "debit_note_issued", label: "Debit Note Issued" },
];

interface LineItem {
  id: string;
  description: string;
  hsnSac: string;
  quantity: number;
  rate: number;
  amount: number;
  gstRate?: number;
}

export function BillingScreen({
  clients,
  onClose,
  onSuccess,
}: {
  clients: Client[];
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [docType, setDocType] = useState<DocType>("purchase_invoice");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [financialYear] = useState(currentFinancialYear());

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      hsnSac: "",
      quantity: 1,
      rate: 0,
      amount: 0,
      gstRate: 18,
    },
  ]);

  const [gstRate, setGstRate] = useState(18);
  const [saving, setSaving] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  const {
    supplier,
    setSupplier,
    recipient,
    setRecipient,
    supplyType,
  } = useAutoFillClient(selectedClient, docType);

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // Calculate GST with per-item rates
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;

  lineItems.forEach((item) => {
    const itemGstRate = item.gstRate || gstRate;
    if (supplyType === "intra_state") {
      totalCgst += (item.amount * (itemGstRate / 2)) / 100;
      totalSgst += (item.amount * (itemGstRate / 2)) / 100;
    } else {
      totalIgst += (item.amount * itemGstRate) / 100;
    }
  });

  const calculation = {
    taxable: subtotal,
    cgst: parseFloat(totalCgst.toFixed(2)),
    sgst: parseFloat(totalSgst.toFixed(2)),
    igst: parseFloat(totalIgst.toFixed(2)),
    cess: 0,
    total: parseFloat((subtotal + totalCgst + totalSgst + totalIgst).toFixed(2)),
  };

  const isClientSupplier = [
    "sales_invoice",
    "credit_note_issued",
    "debit_note_issued",
  ].includes(docType);

  const handleSave = async () => {
    // Validation
    if (!selectedClientId) {
      toast.error("Please select a client");
      return;
    }
    if (!docNumber.trim()) {
      toast.error("Please enter invoice number");
      return;
    }
    if (!supplier.name || !supplier.gstin) {
      toast.error("Please enter supplier details");
      return;
    }
    if (!recipient.name || !recipient.gstin) {
      toast.error("Please enter recipient details");
      return;
    }
    if (lineItems.length === 0 || lineItems.some((item) => !item.description || item.quantity <= 0 || item.rate <= 0)) {
      toast.error("Please add at least one valid line item");
      return;
    }

    setSaving(true);
    try {
      // Create manual document
      const payload = {
        client_id: selectedClientId,
        doc_type: docType,
        doc_number: docNumber,
        doc_date: docDate,
        financial_year: financialYear,
        supplier_name: supplier.name,
        supplier_gstin: supplier.gstin,
        supplier_address: supplier.address,
        supplier_city: supplier.city,
        supplier_state: supplier.state,
        supplier_mobile: supplier.mobile,
        recipient_name: recipient.name,
        recipient_gstin: recipient.gstin,
        recipient_address: recipient.address,
        recipient_city: recipient.city,
        recipient_state: recipient.state,
        recipient_mobile: recipient.mobile,
        supply_type: supplyType,
        place_of_supply: recipient.stateCode,
        taxable: calculation.taxable.toString(),
        cgst: calculation.cgst.toString(),
        sgst: calculation.sgst.toString(),
        igst: calculation.igst.toString(),
        cess: calculation.cess.toString(),
        total: calculation.total.toString(),
        lines: JSON.stringify(lineItems),
      };

      await api.documents.createManual(payload, attachment || undefined);
      toast.success("Invoice created successfully");
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to create invoice:", error);
      toast.error("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Create Invoice</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Section */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Client *
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Select client</option>
                {clients
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Document Type *
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Financial Year
              </label>
              <input
                type="text"
                value={financialYear}
                readOnly
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Invoice / Doc Number *
              </label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="e.g. INV-2026-001"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Date *
              </label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Party Details */}
          <div className="grid grid-cols-2 gap-6">
            <PartySection
              title="Supplier (Bill From)"
              party={supplier}
              onChange={setSupplier}
              readOnly={isClientSupplier}
            />
            <PartySection
              title="Recipient (Bill To)"
              party={recipient}
              onChange={setRecipient}
              readOnly={!isClientSupplier}
            />
          </div>

          {/* Supply Type Indicator */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Supply Type:</span>{" "}
              {supplyType === "intra_state" ? "Intra-State" : "Inter-State"}
              {" "}
              ({supplyType === "intra_state" ? "CGST + SGST" : "IGST only"})
            </p>
          </div>

          {/* Line Items */}
          <LineItemsTableEnhanced
            items={lineItems}
            onChange={setLineItems}
            defaultGstRate={gstRate}
          />

          {/* GST Calculation */}
          <GSTCalculatorEnhanced
            subtotal={subtotal}
            gstRate={gstRate}
            setGstRate={setGstRate}
            supplyType={supplyType}
          />

          {/* Attachment */}
          <AttachmentUpload
            onFileSelect={setAttachment}
            onFileClear={() => setAttachment(null)}
            selectedFile={attachment}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
