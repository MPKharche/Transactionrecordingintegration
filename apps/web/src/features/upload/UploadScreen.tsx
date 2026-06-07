import { useState, useRef, useMemo } from "react";
import type { Client, GSTDocument, DocStage, DocType } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { exportCSV } from "../../lib/csv-export";
import { DOC_TYPE_META, STAGE_META, FALLBACK_DOC_TYPE_META, FALLBACK_STAGE_META } from "../../lib/constants";
import { clientByIdFrom } from "../../lib/format";
import { useAppData } from "../../context/AppDataContext";
import { currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { activateOnEnterSpace } from "../../lib/a11y";
import { ALREADY_IN_RECORDS } from "../../lib/user-copy";
import { DocumentWorklistTable } from "../../components/documents/DocumentWorklistTable";
import { isPipelinePending } from "../../lib/pipeline";
import { ManualEntryModal } from "./ManualEntryModal";

type WorklistFilter = "all" | "ready_for_review" | "processing" | "failed";

const UPLOAD_BATCH = Math.min(
  10,
  Math.max(1, parseInt(import.meta.env.VITE_UPLOAD_CONCURRENCY ?? "5", 10) || 5)
);
import {
  Plus, Search, Download, Upload, ChevronDown, FileText, X, PenLine,
} from "lucide-react";

export function UploadScreen({ docs, clients, isDark, onReview, isAdmin = false }: { docs: GSTDocument[]; clients: Client[]; isDark: boolean; onReview: (id: string) => void; isAdmin?: boolean }) {
  const { uploadFile, retryDocument, bulkLockDocuments, createManualDocument } = useAppData();
  const clientById = (id: string) => clientByIdFrom(clients, id);
  const [dragging, setDragging] = useState(false);
  const [selClient, setSelClient] = useState(clients[0]?.id ?? "");
  const [selType, setSelType] = useState<DocType | "auto">("auto");
  const [queued, setQueued] = useState<{ file: File; name: string; size: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [stageF, setStageF] = useState<WorklistFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLocking, setBulkLocking] = useState(false);
  const [bulkLockError, setBulkLockError] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setQueued((p) => [
      ...p,
      ...Array.from(files).map((f) => ({
        file: f,
        name: f.name,
        size: (f.size / 1024).toFixed(0) + " KB",
      })),
    ]);
  }

  async function startUpload() {
    if (!selClient) {
      setUploadError("Select a client before uploading.");
      return;
    }
    setUploadError("");
    setUploading(true);
    try {
      const concurrency = UPLOAD_BATCH;
      for (let i = 0; i < queued.length; i += concurrency) {
        const batch = queued.slice(i, i + concurrency);
        await Promise.all(
          batch.map((item) => uploadFile(item.file, selClient, selType, financialYear))
        );
      }
      setQueued([]);
    } catch (e) {
      const err = e as Error & { existingId?: string; existingStage?: string };
      const dupHint =
        err.existingStage === "locked"
          ? ` ${ALREADY_IN_RECORDS}`
          : err.existingStage === "ready_for_review"
            ? " This file is already awaiting your review."
            : "";
      setUploadError(
        err.existingId
          ? `${err.message}${dupHint} — open Upload worklist (${err.existingId.slice(0, 8)}…)`
          : err.message || "Upload failed"
      );
    } finally {
      setUploading(false);
    }
  }

  const worklistDocs = useMemo(
    () => docs.filter((d) => d.stage !== "locked"),
    [docs]
  );

  const filtered = worklistDocs.filter((d) => {
    if (stageF === "processing" && !isPipelinePending(d.stage)) return false;
    if (stageF !== "all" && stageF !== "processing" && d.stage !== stageF) return false;
    const q = search.toLowerCase();
    if (q && !d.filename.toLowerCase().includes(q) && !(clientById(d.client_id)?.name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });

  const lockableIds = useMemo(
    () => filtered.filter((d) => d.stage === "ready_for_review").map((d) => d.id),
    [filtered]
  );

  /** US-RECORDS-02: bulk confirm (lock) reviewed documents from the upload worklist. */
  async function confirmSelected() {
    const ids = [...selectedIds].filter((id) => lockableIds.includes(id));
    if (ids.length === 0) return;
    setBulkLockError("");
    setBulkLocking(true);
    try {
      await bulkLockDocuments(ids);
      setSelectedIds(new Set());
    } catch (e) {
      setBulkLockError(e instanceof Error ? e.message : "Could not confirm selected documents");
    } finally {
      setBulkLocking(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllLockable() {
    setSelectedIds(new Set(lockableIds));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Upload Documents" subtitle="Upload invoices and track them until they are confirmed in Records"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManualEntry(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-border text-sm font-medium rounded-lg hover:bg-muted/50 transition-colors text-foreground">
              <PenLine size={16} /> Enter Manually
            </button>
            <button onClick={() => ref.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm">
              <Plus size={16} /> Upload files
            </button>
          </div>
        } />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files — drop PDF, JPG, or PNG here, or press Enter to browse"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => activateOnEnterSpace(e, () => ref.current?.click())}
        className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <input ref={ref} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => addFiles(e.target.files)} aria-hidden />
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload size={26} className="text-primary" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">Drop files here, or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">Supported: PDF, JPG, PNG · Maximum 50 MB per file</p>
        </div>
        <div className="flex items-center gap-3 mt-1" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <select value={selClient} onChange={e => setSelClient(e.target.value)}
              className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer">
              <option value="">Select client</option>
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select value={selType} onChange={e => setSelType(e.target.value as DocType | "auto")}
              className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer">
              <option value="auto">Auto-detect (Mixed PDF)</option>
              {(Object.entries(DOC_TYPE_META) as [DocType, typeof DOC_TYPE_META[DocType]][]).map(([k, v]) =>
                <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
              aria-label="Financial year"
            >
              {listIndianFinancialYears(2016).map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {queued.length > 0 && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{queued.length} file{queued.length > 1 ? "s" : ""} ready to upload</p>
            <button onClick={() => setQueued([])} className="text-sm text-muted-foreground hover:text-foreground">Clear all</button>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {queued.map((f, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <FileText size={15} className="text-primary shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{f.size}</span>
                <button onClick={() => setQueued(p => p.filter((_, j) => j !== i))}><X size={14} className="text-muted-foreground hover:text-foreground" /></button>
              </div>
            ))}
          </div>
          {uploadError && (
            <p className="text-sm text-red-500">{uploadError}</p>
          )}
          <button
            type="button"
            disabled={uploading}
            onClick={startUpload}
            className="w-full py-2.5 bg-primary rounded-lg text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Start upload"}
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by filename or client…"
              className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => {
            exportCSV("all_documents.csv",
              ["Filename","Client","Doc Number","Date","Type","Status","Issues"],
              filtered.map(d => [d.filename, clientById(d.client_id)?.name ?? "", d.doc_number, d.doc_date, DOC_TYPE_META[d.doc_type]?.label ?? FALLBACK_DOC_TYPE_META.label, STAGE_META[d.stage]?.label ?? FALLBACK_STAGE_META.label, d.issues.length])
            );
          }} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
            <Download size={14} /> Export CSV
          </button>
          {lockableIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={selectAllLockable}
                className="px-3 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground"
              >
                Select all awaiting review ({lockableIds.length})
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || bulkLocking}
                onClick={confirmSelected}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkLocking ? "Confirming…" : `Confirm selected (${selectedIds.size})`}
              </button>
            </>
          )}
          {bulkLockError ? <p className="text-sm text-red-500 w-full">{bulkLockError}</p> : null}
          <div className="flex gap-1.5">
            {([["all","All"],["ready_for_review","Needs review"],["processing","Processing"],["failed","Needs attention"]] as [WorklistFilter, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setStageF(id)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${stageF === id ? "bg-primary text-white font-medium" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <DocumentWorklistTable
          docs={filtered}
          clients={clients}
          isDark={isDark}
          onReview={onReview}
          onRetry={retryDocument}
          showAdminCost={isAdmin}
          selectableIds={lockableIds}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      </div>

      {showManualEntry && (
        <ManualEntryModal
          clients={clients}
          onClose={() => setShowManualEntry(false)}
          onSave={createManualDocument}
        />
      )}
    </div>
  );
}
