import type { Client, GSTDocument, GstrReadinessReport } from "@ca-suite/shared";
import { GstrReadinessPanel } from "../../features/review/GstrReadinessPanel";
import { CopyBtn } from "../ui/CopyBtn";
import { INR, getCounterParty } from "../../lib/format";
import { DOC_TYPE_META } from "../../lib/constants";
import { Eye, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

const LBL = "text-[10px] text-muted-foreground leading-none";
const VAL = "text-xs text-foreground truncate leading-tight mt-0.5";

/** Build a set of field keys that are non-ok (missing / invalid) for compliance rows. */
function badFieldSet(report: GstrReadinessReport): Set<string> {
  const s = new Set<string>();
  for (const row of report.rows) {
    if (row.tier === "compliance" && row.status !== "ok") {
      s.add(row.field);
    }
  }
  return s;
}

function F({
  label,
  value,
  mono,
  err,
  errHint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  err?: boolean;
  errHint?: string;
}) {
  const v = value?.trim() || "—";
  return (
    <div className="min-w-0">
      <p className={`${LBL} ${err ? "text-red-500 dark:text-red-400" : ""}`}>{label}</p>
      <p
        className={`${VAL} ${mono ? "font-mono tabular-nums" : ""} ${err ? "text-red-500 dark:text-red-400" : ""}`}
        title={err && errHint ? errHint : v}
      >
        {v}
        {err && (
          <span title={errHint ?? "Missing or invalid"} className="inline-block ml-1 align-middle">
            <AlertCircle size={10} className="text-red-500 dark:text-red-400 inline" />
          </span>
        )}
      </p>
    </div>
  );
}

function Gstin({ label, gstin, err, errHint }: { label: string; gstin: string; err?: boolean; errHint?: string }) {
  const v = gstin?.trim() || "—";
  return (
    <div className="min-w-0">
      <p className={`${LBL} ${err ? "text-red-500 dark:text-red-400" : ""}`}>{label}</p>
      <div className="flex items-center gap-0.5 mt-0.5">
        <p className={`${VAL} font-mono flex-1 ${err ? "text-red-500 dark:text-red-400" : ""}`} title={err && errHint ? errHint : v}>
          {v}
          {err && (
            <span title={errHint ?? "Missing or invalid"} className="inline-block ml-1 align-middle">
              <AlertCircle size={10} className="text-red-500 dark:text-red-400 inline" />
            </span>
          )}
        </p>
        {gstin?.trim() ? <CopyBtn text={gstin} /> : null}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 sm:gap-3 py-1 border-b border-border/50 last:border-0">
      <span className="w-16 sm:w-[4.5rem] shrink-0 text-[10px] font-semibold text-muted-foreground uppercase leading-tight pt-1">
        {label}
      </span>
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

function supplyLabel(type: string | undefined): string {
  if (type === "inter_state") return "Inter-state";
  if (type === "intra_state") return "Intra-state";
  return type?.replace(/_/g, " ") ?? "—";
}

export function DocumentExpandedDetail({
  doc,
  client,
  report,
  onReview,
}: {
  doc: GSTDocument;
  client?: Client;
  report: GstrReadinessReport;
  onReview: (id: string) => void;
}) {
  const party = getCounterParty(doc);
  const isOutward = ["sales_invoice", "debit_note_issued", "credit_note_issued"].includes(doc.doc_type);
  const partyRowLabel = isOutward ? "Customer" : "Supplier";
  const pages =
    doc.page_start != null
      ? doc.page_start === doc.page_end
        ? `p.${doc.page_start}`
        : `p.${doc.page_start}–${doc.page_end}`
      : "";

  const bad = badFieldSet(report);
  const hint = (f: string) => report.rows.find((r) => r.field === f)?.remark;

  // Count line-level compliance issues (lines.N.*)
  const lineIssueCount = report.rows.filter(
    (r) => r.tier === "compliance" && r.status !== "ok" && r.field.startsWith("lines.")
  ).length;

  return (
    <div className="px-2 py-1.5 bg-muted/25 border-t border-border/60 text-xs" onClick={(e) => e.stopPropagation()}>
      <Row label="Doc">
        <F label="Number" value={doc.doc_number} mono err={bad.has("doc_number")} errHint={hint("doc_number")} />
        <F label="Date" value={doc.doc_date} mono err={bad.has("doc_date")} errHint={hint("doc_date")} />
        <F label="Type" value={DOC_TYPE_META[doc.doc_type]?.short ?? doc.doc_type} />
        <F label="FY" value={doc.financial_year ?? ""} mono />
        <F label="File" value={pages ? `${doc.filename} · ${pages}` : doc.filename} />
      </Row>

      <Row label="Supply">
        <F label="Place of supply" value={doc.place_of_supply} mono err={bad.has("place_of_supply")} errHint={hint("place_of_supply")} />
        <F label="Supply type" value={supplyLabel(doc.supply_type)} />
        <F label="Reverse charge" value={doc.reverse_charge ? "Yes" : "No"} />
        <F label="ITC" value={doc.itc_eligible === false ? "No" : "Yes"} err={bad.has("itc_eligible")} errHint={hint("itc_eligible")} />
      </Row>

      <Row label="Amounts">
        <F label="Taxable" value={INR(doc.taxable_amount)} mono err={bad.has("taxable_amount")} errHint={hint("taxable_amount")} />
        <F label="IGST" value={INR(doc.igst)} mono err={bad.has("tax")} errHint={hint("tax")} />
        <F label="CGST+SGST" value={INR(doc.cgst + doc.sgst)} mono />
        <F label="Total" value={INR(doc.total)} mono err={bad.has("total")} errHint={hint("total")} />
        {lineIssueCount > 0 && (
          <div className="min-w-0 flex items-end">
            <span
              title={`${lineIssueCount} line-level compliance issue${lineIssueCount > 1 ? "s" : ""} — open review to fix`}
              className="inline-flex items-center gap-0.5 text-[10px] text-red-500 dark:text-red-400"
            >
              <AlertCircle size={10} />
              {lineIssueCount} line {lineIssueCount > 1 ? "issues" : "issue"}
            </span>
          </div>
        )}
      </Row>

      <Row label={partyRowLabel}>
        <F label="Name" value={party.name} err={bad.has("supplier.name") || bad.has("recipient.name")} errHint={hint("supplier.name") ?? hint("recipient.name")} />
        <Gstin label="GSTIN" gstin={party.gstin} err={bad.has("supplier.gstin") || bad.has("recipient.gstin")} errHint={hint("supplier.gstin") ?? hint("recipient.gstin")} />
        <F
          label="State"
          value={party.state ? `${party.state}${party.state_code ? ` (${party.state_code})` : ""}` : ""}
        />
      </Row>

      <Row label="Client">
        <F label="Name" value={client?.name ?? ""} />
        <Gstin label="GSTIN" gstin={client?.gstin ?? ""} />
        <F
          label="State"
          value={client?.state ? `${client.state}${client.state_code ? ` (${client.state_code})` : ""}` : ""}
        />
      </Row>

      <div className="pt-1">
        <GstrReadinessPanel report={report} />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={() => onReview(doc.id)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Eye size={12} /> {doc.stage === "locked" ? "View record" : "Open review"}
        </button>
      </div>
    </div>
  );
}
