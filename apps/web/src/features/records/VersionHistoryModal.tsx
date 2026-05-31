import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { X, RotateCcw, Clock, User, Loader2, AlertCircle } from "lucide-react";

interface VersionEntry {
  id: string;
  versionNo: number;
  changeSummary: string | null;
  changedBy: string;
  changedAt: string;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
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
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<VersionEntry | null>(null);

  useEffect(() => {
    setLoading(true);
    api.versions.list(docId)
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load versions"))
      .finally(() => setLoading(false));
  }, [docId]);

  async function doRestore(v: VersionEntry) {
    setRestoringId(v.id);
    try {
      await api.versions.restore(docId, v.id, restoreNote.trim() || `Restored from v${v.versionNo}`);
      onRestore(docId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringId(null);
      setConfirmRestore(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">Version History</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading versions…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm py-4">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {!loading && !error && versions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>No edit history yet.</p>
              <p className="text-xs mt-1">Versions are created each time you edit this locked document.</p>
            </div>
          )}
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-primary">v{v.versionNo}</span>
                  <span className="text-[10px] text-muted-foreground">{fmt(v.changedAt)}</span>
                </div>
                <p className="text-xs text-foreground mt-0.5 truncate">
                  {v.changeSummary?.trim() || <span className="text-muted-foreground italic">No summary</span>}
                </p>
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                  <User size={9} /> {v.changedBy}
                </div>
              </div>
              <button
                onClick={() => { setRestoreNote(""); setConfirmRestore(v); }}
                disabled={restoringId === v.id}
                title={`Restore document to this state (v${v.versionNo})`}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
              >
                {restoringId === v.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                Restore
              </button>
            </div>
          ))}
        </div>

        {/* Restore confirmation overlay */}
        {confirmRestore && (
          <div className="px-5 py-4 border-t border-border bg-muted/30 space-y-3">
            <p className="text-sm font-medium text-foreground">
              Restore to <span className="font-mono text-primary">v{confirmRestore.versionNo}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Current state will be saved as a new version before restoring.
            </p>
            <input
              value={restoreNote}
              onChange={(e) => setRestoreNote(e.target.value)}
              placeholder={`Restored from v${confirmRestore.versionNo} — add note (optional)`}
              className="w-full px-3 py-1.5 text-xs border border-border rounded-md bg-input text-foreground focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => { void doRestore(confirmRestore); }}
                disabled={!!restoringId}
                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 flex items-center gap-1"
              >
                {restoringId ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                Restore
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
