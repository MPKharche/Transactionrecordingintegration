import type { GSTDocument } from "@ca-suite/shared";

interface MunimRow {
  "Invoice Date *": string;
  "Invoice No. *": string;
  "Billing Name": string;
  "Billing GSTIN": string;
  "GST Reg. State No. *": string;
  "GSR_Walk_In *": string;
  "GSR_Walk_In_No": string;
  "Place of Supply (State) *": string;
  "Item Description": string;
  "HSN / SAC Code": string;
  "Quantity": string;
  "Item Unit (UQC)": string;
  "Taxable Value *": string;
  "Assessable Value": string;
  "GST Rate (%)": string;
  "CGST Amount": string;
  "Change Currency": string;
  "Item GST Type": string;
  "Invoice Type": string;
  "Type of Export": string;
  "Shipping Port Code (Imports)": string;
  "Shipping Bill No. (Export)": string;
  "Shipping Bill Date - Export": string;
  "Shipping Bill Details": string;
}

export function exportToMunimFormat(documents: GSTDocument[]): void {
  // Filter only sales invoices
  const salesInvoices = documents.filter(
    (doc) =>
      doc.doc_type === "sales_invoice" &&
      doc.status === "extracted" &&
      doc.locked
  );

  if (salesInvoices.length === 0) {
    throw new Error("No sales invoices found to export");
  }

  const rows: MunimRow[] = [];

  salesInvoices.forEach((doc) => {
    // Parse line items if available
    let lineItems: any[] = [];
    try {
      lineItems = doc.lines ? JSON.parse(doc.lines) : [];
    } catch (e) {
      // If no line items, create single row for the document
      lineItems = [
        {
          description: "Invoice Items",
          hsnSac: "",
          quantity: 1,
          rate: parseFloat(doc.taxable || "0"),
          amount: parseFloat(doc.taxable || "0"),
        },
      ];
    }

    lineItems.forEach((item) => {
      const row: MunimRow = {
        "Invoice Date *": doc.doc_date || "",
        "Invoice No. *": doc.doc_number || "",
        "Billing Name": doc.recipient_name || "",
        "Billing GSTIN": doc.recipient_gstin || "",
        "GST Reg. State No. *": doc.recipient_gstin?.slice(0, 2) || "",
        "GSR_Walk_In *": doc.recipient_gstin ? "No" : "Yes",
        "GSR_Walk_In_No": "",
        "Place of Supply (State) *": doc.place_of_supply || doc.recipient_gstin?.slice(0, 2) || "",
        "Item Description": item.description || "",
        "HSN / SAC Code": item.hsnSac || "",
        "Quantity": item.quantity?.toString() || "1",
        "Item Unit (UQC)": "NOS",
        "Taxable Value *": item.amount?.toFixed(2) || "0.00",
        "Assessable Value": item.amount?.toFixed(2) || "0.00",
        "GST Rate (%)": (item.gstRate || 18).toString(),
        "CGST Amount":
          doc.supply_type === "intra_state"
            ? ((item.amount * (item.gstRate || 18)) / 200).toFixed(2)
            : "0.00",
        "Change Currency": "INR",
        "Item GST Type": doc.supply_type === "intra_state" ? "Goods" : "Interstate Goods",
        "Invoice Type": "Regular B2B",
        "Type of Export": "",
        "Shipping Port Code (Imports)": "",
        "Shipping Bill No. (Export)": "",
        "Shipping Bill Date - Export": "",
        "Shipping Bill Details": "",
      };

      rows.push(row);
    });
  });

  // Convert to CSV
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof MunimRow];
          // Escape quotes and wrap in quotes if contains comma
          return value.includes(",") ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    ),
  ].join("\n");

  // Download CSV
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `munim_sales_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
