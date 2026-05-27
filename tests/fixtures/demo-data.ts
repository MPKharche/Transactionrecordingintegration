/** Test-only fixtures — not bundled in production web app. */
import type { Client, GSTDocument } from "@ca-suite/shared";
import { mkLine } from "./mock-builders";
import {
  P_RELIANCE,
  P_TATA,
  P_HDFC,
  P_INFOSYS,
  P_ITC,
  P_FUTURE,
  P_SIEMENS,
  P_FORD,
  P_BLOOMBERG,
  P_BAJAJ,
  P_ACCENTURE,
  P_MSFT,
  P_SPENCERS,
  P_EMPTY,
} from "./demo-parties";

export const FIXTURE_CLIENTS: Client[] = [
  {
    id: "c1",
    name: "Reliance Retail Ltd",
    gstin: "27AAACR5055K1ZJ",
    pan: "AAACR5055K",
    active: true,
    state: "Maharashtra",
    state_code: "27",
    address: "Mumbai",
    mobile: "",
    email: "",
  },
];

export const FIXTURE_DOCS: GSTDocument[] = [
  {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    filename: "sample_invoice.pdf",
    client_id: "c1",
    doc_type: "sales_invoice",
    doc_number: "INV-001",
    doc_date: "2024-04-03",
    recorded_at: "",
    supplier: P_RELIANCE,
    recipient: P_FUTURE,
    supply_type: "intra_state",
    reverse_charge: false,
    place_of_supply: "Maharashtra (27)",
    lines: [mkLine("l1", "Services", "996512", 1, 10000, 18, false)],
    taxable_amount: 10000,
    igst: 0,
    cgst: 900,
    sgst: 900,
    cess: 0,
    total: 11800,
    stage: "ready_for_review",
    extraction_method: "ai",
    issues: [],
  },
];

export {
  P_RELIANCE,
  P_TATA,
  P_HDFC,
  P_INFOSYS,
  P_ITC,
  P_FUTURE,
  P_SIEMENS,
  P_FORD,
  P_BLOOMBERG,
  P_BAJAJ,
  P_ACCENTURE,
  P_MSFT,
  P_SPENCERS,
  P_EMPTY,
};
