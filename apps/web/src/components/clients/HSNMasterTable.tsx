import { useState, useMemo } from "react";
import { Search, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export interface HSNRecord {
  code: string;
  description: string;
  default_gst_rate?: number;
  use_count: number;
  is_client_specific?: boolean;
}

type SortKey = "code" | "description" | "rate" | "usage";
type SortOrder = "asc" | "desc";

export function HSNMasterTable({
  hsns,
  isLoading,
  isReadonly,
  onAdd,
  onDelete,
  onRateChange,
}: {
  hsns: HSNRecord[];
  isLoading: boolean;
  isReadonly: boolean;
  onAdd?: (code: string, description: string, rate: number | null) => Promise<void>;
  onDelete?: (code: string) => Promise<void>;
  onRateChange?: (code: string, rate: number | null) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("code");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>("");
  const [addingNew, setAddingNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRate, setNewRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return hsns.filter(
      (h) =>
        h.code.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q)
    );
  }, [hsns, search]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortBy === "code") {
        aVal = a.code;
        bVal = b.code;
      } else if (sortBy === "description") {
        aVal = a.description;
        bVal = b.description;
      } else if (sortBy === "rate") {
        aVal = a.default_gst_rate ?? 0;
        bVal = b.default_gst_rate ?? 0;
      } else {
        // usage
        aVal = a.use_count;
        bVal = b.use_count;
      }

      const cmp =
        typeof aVal === "string"
          ? aVal.localeCompare(bVal as string)
          : (aVal as number) - (bVal as number);

      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortBy, sortOrder]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const handleStartEdit = (code: string, rate: number | undefined) => {
    setEditingCode(code);
    setEditingRate(String(rate ?? ""));
  };

  const handleSaveRate = async (code: string) => {
    if (!onRateChange) return;

    setSaveLoading(true);
    setError(null);
    try {
      const rate = editingRate.trim() === "" ? null : parseFloat(editingRate);
      if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
        setError("Rate must be between 0 and 100");
        return;
      }
      await onRateChange(code, rate);
      setEditingCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAddHSN = async () => {
    if (!onAdd) return;

    const code = newCode.trim();
    if (!code) {
      setError("Code required");
      return;
    }
    if (!/^\d{4,8}$/.test(code)) {
      setError("Code must be 4-8 digits");
      return;
    }
    if (hsns.some((h) => h.code === code)) {
      setError("HSN code already exists");
      return;
    }

    setSaveLoading(true);
    setError(null);
    try {
      const rate = newRate.trim() === "" ? null : parseFloat(newRate);
      if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
        setError("Rate must be between 0 and 100");
        return;
      }
      await onAdd(code, newDesc.trim(), rate);
      setAddingNew(false);
      setNewCode("");
      setNewDesc("");
      setNewRate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add HSN");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!onDelete) return;

    setSaveLoading(true);
    setError(null);
    try {
      await onDelete(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaveLoading(false);
    }
  };

  const SortIcon = ({ current, order }: { current: SortKey; order: SortOrder }) => {
    if (sortBy !== current) return <ChevronUp size={14} className="text-muted-foreground opacity-20" />;
    return order === "asc"
      ? <ChevronUp size={14} className="text-primary" />
      : <ChevronDown size={14} className="text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Search + Add button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description…"
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        {!isReadonly && onAdd && (
          <button
            onClick={() => {
              setAddingNew(!addingNew);
              setError(null);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Add HSN
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add new HSN form */}
      {addingNew && !isReadonly && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Code (4-8 digits)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              maxLength={8}
              className="bg-white border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <input
              type="text"
              placeholder="Description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="bg-white border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <input
              type="number"
              placeholder="GST Rate (%)"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              min="0"
              max="100"
              step="0.01"
              className="bg-white border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddHSN}
                disabled={saveLoading}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saveLoading ? "Saving…" : "Add"}
              </button>
              <button
                onClick={() => {
                  setAddingNew(false);
                  setNewCode("");
                  setNewDesc("");
                  setNewRate("");
                  setError(null);
                }}
                className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => toggleSort("code")}
                  className="flex items-center gap-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  Code <SortIcon current="code" order={sortOrder} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => toggleSort("description")}
                  className="flex items-center gap-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  Description <SortIcon current="description" order={sortOrder} />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => toggleSort("rate")}
                  className="flex items-center gap-2 ml-auto font-semibold text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  Default GST Rate <SortIcon current="rate" order={sortOrder} />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={() => toggleSort("usage")}
                  className="flex items-center gap-2 ml-auto font-semibold text-xs text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                >
                  Usage <SortIcon current="usage" order={sortOrder} />
                </button>
              </th>
              {!isReadonly && onDelete && <th className="px-4 py-3 text-right w-12"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={isReadonly || !onDelete ? 4 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading HSN master…
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={isReadonly || !onDelete ? 4 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  No HSN codes found
                </td>
              </tr>
            )}
            {sorted.map((hsn) => (
              <tr key={hsn.code} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3.5 font-mono text-sm font-semibold text-foreground">
                  {hsn.code}
                  {hsn.is_client_specific && (
                    <span className="ml-2 inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-normal">
                      Custom
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-foreground">{hsn.description || "—"}</td>
                <td className="px-4 py-3.5 text-sm text-right text-foreground">
                  {editingCode === hsn.code ? (
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        type="number"
                        value={editingRate}
                        onChange={(e) => setEditingRate(e.target.value)}
                        min="0"
                        max="100"
                        step="0.01"
                        className="w-20 bg-white border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-primary"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRate(hsn.code)}
                        disabled={saveLoading}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingCode(null)}
                        className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-400"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartEdit(hsn.code, hsn.default_gst_rate)}
                      disabled={isReadonly}
                      className={`font-mono ${
                        isReadonly
                          ? "text-foreground cursor-default"
                          : "text-blue-600 hover:underline cursor-pointer"
                      }`}
                    >
                      {hsn.default_gst_rate !== undefined
                        ? `${hsn.default_gst_rate.toFixed(2)}%`
                        : "—"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3.5 text-sm text-right text-muted-foreground">
                  {hsn.use_count}
                </td>
                {!isReadonly && onDelete && (
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => {
                        if (hsn.use_count > 0) {
                          setError(`Cannot delete HSN ${hsn.code}: still in use (${hsn.use_count} times)`);
                        } else {
                          handleDelete(hsn.code);
                        }
                      }}
                      disabled={hsn.use_count > 0 || saveLoading}
                      className={`inline-flex items-center gap-1.5 text-sm ${
                        hsn.use_count > 0
                          ? "text-gray-400 cursor-not-allowed"
                          : "text-red-600 hover:text-red-700 cursor-pointer"
                      }`}
                      title={hsn.use_count > 0 ? `In use (${hsn.use_count} times)` : "Delete"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        💡 Double-click a rate to edit. Client-specific rates override global defaults. Codes marked "Custom" are
        specific to this client.
      </p>
    </div>
  );
}
