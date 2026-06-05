import { useState, useEffect } from "react";
import type { GSTDocument, VersionFieldChange } from "@ca-suite/shared";
import { api } from "../../lib/api";
import { CAPTURE_SOURCE_LABELS, formatCapturedAt } from "../../lib/capture-meta";
import { VersionDocumentPreview } from "./VersionDocumentPreview";
import {
  X,
  RotateCcw,
  Clock,
  User,
  Loader2,
  AlertCircle,
  Monitor,
  Upload,
  ChevronRight,
  Eye,
} from "lucide-react";

export type VersionListEntry = {
  id: string;
  versionNo: number;
  changeSummary: string | null;
  changedBy: string;
  changedAt: string;
  modificationChannel: string;
  captureSource?: string;
  capturedAt?: string;
  uploadedBy?: string;
  changes: VersionFieldChange[];
};

function channelLabel(ch: string): string {
  if (ch === "web") return "Web editor";
  return CAPTURE_SOURCE_LABELS[ch as keyof typeof CAPTURE_SOURCE_LABELS] ?? ch;
}

function ingestLabel(src?: string): string {
  if (!src) return "—";
  return CAPTURE_SOURCE_LABELS[src as keyof typeof CAPTURE_SOURCE_LABELS] ?? src;
}

export function VersionHistoryModal({
  docId,
  onClose,
  onRestore,
}: {
  docId: string;
  onClose: () => void;
  onRestore: (docId: string) => void;
}) {
  const [versions, setVersions] = useState<VersionListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<VersionListEntry | null>(null);
  const [preview, setPreview] = useState<{
    entry: VersionListEntry;
    doc: GSTDocument;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.versions
      .list(docId)
      .then((rows) => setVersions(rows as VersionListEntry[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load versions"))
      .finally(() => setLoading(false));
  }, [docId]);

  async function openPreview(v: VersionListEntry) {
    setPreviewLoading(true);
    setError("");
    try {
      const payload = await api.versions.load(docId, v.id);
      const doc =
        "snapshot" in payload && payload.snapshot
          ? (payload.snapshot as GSTDocument)
          : (payload as GSTDocument);
      setPreview({ entry: v, doc });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load version");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function doRestore(v: VersionListEntry) {
    setRestoringId(v.id);
    try {
      await api.versions.restore(docId, v.id, restoreNote.trim() || `Restored from v${v.versionNo}`);
      setPreview(null);
      onRestore(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringId(null);
      setConfirmRestore(null);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-muted-foreground" />
              <h2 className="font-semibold text-foreground text-sm">Version history &amp; changes</h2>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
                <Loader2 size={16} className="animate-spin" /> Loading history…
              </div>
            )}
            {error && !preview && (
              <div className="flex items-center gap-2 text-red-500 text-sm py-4">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {!loading && !error && versions.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <p>No edit history yet.</p>
                <p className="text-xs mt-1">Each save on a locked record creates a version with a field-level diff.</p>
              </div>
            )}

            {versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-border bg-muted/15 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => void openPreview(v)}
                  disabled={previewLoading}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors flex items-start gap-2"
                >
                  <ChevronRight size={14} className="text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span className="font-mono font-semibold text-primary">v{v.versionNo}</span>
                      <span className="text-muted-foreground">{formatCapturedAt(v.changedAt)}</span>
                      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                        <User size={10} /> {v.changedBy}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                        <Monitor size={10} /> {channelLabel(v.modificationChannel)}
                      </span>
                      {v.captureSource ? (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                          <Upload size={10} /> Original: {ingestLabel(v.captureSource)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-foreground mt-1">
                      {v.changeSummary?.trim() || (
                        <span className="italic text-muted-foreground">Manual edit</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                    <Eye size={12} /> Preview
                  </span>
                </button>

                {v.changes.length > 0 ? (
                  <div className="border-t border-border/60 px-3 py-2 overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium py-1 pr-2">Field</th>
                          <th className="text-left font-medium py-1 pr-2">Earlier value</th>
                          <th className="text-left font-medium py-1">New value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.changes.map((c) => (
                          <tr key={c.field} className="border-t border-border/40">
                            <td className="py-1 pr-2 font-medium text-foreground whitespace-nowrap">{c.label}</td>
                            <td className="py-1 pr-2 text-muted-foreground max-w-[140px] truncate" title={c.before}>
                              {c.before}
                            </td>
                            <td className="py-1 text-foreground max-w-[140px] truncate" title={c.after}>
                              {c.after}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground italic">
                    No field differences recorded for this step (snapshot matches next state).
                  </p>
                )}

                <div className="border-t border-border/60 px-3 py-1.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void openPreview(v)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Open full preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreNote("");
                      setConfirmRestore(v);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw size={10} /> Restore…
                  </button>
                </div>
              </div>
            ))}
          </div>

          {confirmRestore && (
            <div className="px-5 py-4 border-t border-border bg-muted/30 space-y-3 shrink-0">
              <p className="text-sm font-medium text-foreground">
                Restore to <span className="font-mono text-primary">v{confirmRestore.versionNo}</span>?
              </p>
              <p className="text-xs text-muted-foreground">
                Review the preview first if unsure. Current state is saved as a new version before restore.
              </p>
              <input
                value={restoreNote}
                onChange={(e) => setRestoreNote(e.target.value)}
                placeholder={`Restored from v${confirmRestore.versionNo} — note (optional)`}
                className="w-full px-3 py-1.5 text-xs border border-border rounded-md bg-input text-foreground focus:outline-none focus:border-primary"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRestore(null)}
                  className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void openPreview(confirmRestore)}
                  className="px-3 py-1.5 text-xs border border-border rounded-md text-primary"
                >
                  Preview first
                </button>
                <button
                  type="button"
                  onClick={() => void doRestore(confirmRestore)}
                  disabled={!!restoringId}
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {restoringId ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                  Restore
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && (
        <VersionDocumentPreview
          doc={preview.doc}
          versionNo={preview.entry.versionNo}
          changedAt={preview.entry.changedAt}
          changedBy={preview.entry.changedBy}
          changeSummary={preview.entry.changeSummary}
          captureSource={preview.entry.captureSource}
          onClose={() => setPreview(null)}
          onRestore={() => {
            setRestoreNote(`Restored from v${preview.entry.versionNo}`);
            void doRestore(preview.entry);
          }}
          restoring={restoringId === preview.entry.id}
        />
      )}
    </>
  );
}
