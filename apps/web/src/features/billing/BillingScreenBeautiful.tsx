import { useState, useEffect } from "react";
import { X, FileText } from "lucide-react";
import type { Client, GSTDocument } from "@ca-suite/shared";
import { useAutoFillClient } from "./hooks/useAutoFillClient";
import { PartySectionWithSearch } from "./components/PartySectionWithSearch";
import { LineItemsTableBeautiful } from "./components/LineItemsTableBeautiful";
import { GSTCalculatorBeautiful } from "./components/GSTCalculatorBeautiful";
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

const DOC_TYPE_OPTIONS: { value: DocType; label: string; icon: string }[] = [
  { value: "purchase_invoice", label: "Purchase Invoice", icon: "📥" },
  { value: "sales_invoice", label: "Sales Invoice", icon: "📤" },
  { value: "credit_note_received", label: "Credit Note Received", icon: "🔄" },
  { value: "credit_note_issued", label: "Credit Note Issued", icon: "🔄" },
  { value: "debit_note_received", label: "Debit Note Received", icon: "📝" },
  { value: "debit_note_issued", label: "Debit Note Issued", icon: "📝" },
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

interface Party {
  id: string;
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  mobile: string;
  email: string;
}

export function BillingScreenBeautiful({
  clients,
  documents,
  onClose,
  onSuccess,
}: {
  clients: Client[];
  documents?: GSTDocument[];
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

  // Build party master from existing documents
  const [partyMaster, setPartyMaster] = useState<Party[]>([]);

  useEffect(() => {
    if (documents) {
      const parties = new Map<string, Party>();

      documents.forEach((doc) => {
        // Add supplier
        if (doc.supplier_gstin && doc.supplier_name) {
          const key = doc.supplier_gstin;
          if (!parties.has(key)) {
            parties.set(key, {
              id: key,
              name: doc.supplier_name,
              gstin: doc.supplier_gstin,
              address: doc.supplier_address || "",
              city: doc.supplier_city || "",
              state: doc.supplier_state || "",
              stateCode: doc.supplier_gstin.slice(0, 2),
              mobile: doc.supplier_mobile || "",
              email: "",
            });
          }
        }

        // Add recipient
        if (doc.recipient_gstin && doc.recipient_name) {
          const key = doc.recipient_gstin;
          if (!parties.has(key)) {
            parties.set(key, {
              id: key,
              name: doc.recipient_name,
              gstin: doc.recipient_gstin,
              address: doc.recipient_address || "",
              city: doc.recipient_city || "",
              state: doc.recipient_state || "",
              stateCode: doc.recipient_gstin.slice(0, 2),
              mobile: doc.recipient_mobile || "",
              email: "",
            });
          }
        }
      });

      setPartyMaster(Array.from(parties.values()));
    }
  }, [documents]);

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

  const handleSaveNewParty = async (party: any) => {
    // In real implementation, save to backend party master
    // For now, just add to local state
    setPartyMaster((prev) => [
      ...prev,
      {
        id: party.gstin,
        name: party.name,
        gstin: party.gstin,
        address: party.address,
        city: party.city,
        state: party.state,
        stateCode: party.stateCode,
        mobile: party.mobile,
        email: party.email,
      },
    ]);
    toast.success("Party added to database");
  };

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-primary to-primary/80 px-3 py-2 flex items-center justify-between rounded-t-lg z-50">
          <div>
            <h2 className="text-base font-bold text-white">Create Invoice</h2>
            <p className="text-white/80 text-xs">Fill in the details below</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Basic Details */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Client *</label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Select client</option>
                {clients.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Document Type *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Financial Year</label>
              <input
                type="text"
                value={financialYear}
                readOnly
                className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 text-xs text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Invoice Number *</label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="e.g. INV-2026-001"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Date *</label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Party Details */}
          <div className="grid grid-cols-2 gap-2">
            <PartySectionWithSearch
              title="Supplier (Bill From)"
              party={supplier}
              onChange={setSupplier}
              readOnly={isClientSupplier}
              parties={partyMaster}
              onSaveNewParty={handleSaveNewParty}
            />
            <PartySectionWithSearch
              title="Recipient (Bill To)"
              party={recipient}
              onChange={setRecipient}
              readOnly={!isClientSupplier}
              parties={partyMaster}
              onSaveNewParty={handleSaveNewParty}
            />
          </div>

          {/* Supply Type Badge */}
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded px-3 py-1.5 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
            <span className="text-xs font-medium text-foreground">Supply Type:</span>
            <span className="text-xs font-bold text-primary">
              {supplyType === "intra_state" ? "Intra-State" : "Inter-State"}
            </span>
            <span className="text-xs text-muted-foreground">
              ({supplyType === "intra_state" ? "CGST+SGST" : "IGST"})
            </span>
          </div>

          {/* Line Items */}
          <LineItemsTableBeautiful
            items={lineItems}
            onChange={setLineItems}
            defaultGstRate={gstRate}
          />

          {/* GST Calculation */}
          <GSTCalculatorBeautiful
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
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-border rounded text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-gradient-to-r from-primary to-primary/80 text-white rounded text-xs font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "💾 Save Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
