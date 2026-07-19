import { useState, useEffect } from "react";
import type { Client } from "@ca-suite/shared";

type DocType =
  | "purchase_invoice"
  | "sales_invoice"
  | "credit_note_issued"
  | "credit_note_received"
  | "debit_note_issued"
  | "debit_note_received";

interface PartyDetails {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  mobile: string;
  email: string;
}

const emptyParty: PartyDetails = {
  name: "",
  gstin: "",
  address: "",
  city: "",
  state: "",
  stateCode: "",
  mobile: "",
  email: "",
};

export function useAutoFillClient(
  selectedClient: Client | null,
  docType: DocType
) {
  const [supplier, setSupplier] = useState<PartyDetails>(emptyParty);
  const [recipient, setRecipient] = useState<PartyDetails>(emptyParty);
  const [supplyType, setSupplyType] = useState<"intra_state" | "inter_state">("intra_state");

  useEffect(() => {
    if (!selectedClient) {
      setSupplier(emptyParty);
      setRecipient(emptyParty);
      return;
    }

    const clientAsParty: PartyDetails = {
      name: selectedClient.name,
      gstin: selectedClient.gstin,
      address: selectedClient.address || "",
      city: selectedClient.city || "",
      state: selectedClient.state || "",
      stateCode: selectedClient.stateCode || selectedClient.gstin.slice(0, 2),
      mobile: selectedClient.mobile || "",
      email: selectedClient.email || "",
    };

    // Purchase-side: Client is recipient (Bill To)
    const isPurchaseSide = [
      "purchase_invoice",
      "credit_note_received",
      "debit_note_received",
    ].includes(docType);

    // Sales-side: Client is supplier (Bill From)
    const isSalesSide = [
      "sales_invoice",
      "credit_note_issued",
      "debit_note_issued",
    ].includes(docType);

    if (isPurchaseSide) {
      setRecipient(clientAsParty);
      setSupplier(emptyParty); // Manual entry
    } else if (isSalesSide) {
      setSupplier(clientAsParty);
      setRecipient(emptyParty); // Manual entry
    }
  }, [selectedClient, docType]);

  // Auto-detect supply type when both parties have state codes
  useEffect(() => {
    if (supplier.stateCode && recipient.stateCode) {
      const supCode = supplier.stateCode.padStart(2, "0").slice(0, 2);
      const recCode = recipient.stateCode.padStart(2, "0").slice(0, 2);
      setSupplyType(supCode === recCode ? "intra_state" : "inter_state");
    }
  }, [supplier.stateCode, recipient.stateCode]);

  return {
    supplier,
    setSupplier,
    recipient,
    setRecipient,
    supplyType,
    setSupplyType,
  };
}
