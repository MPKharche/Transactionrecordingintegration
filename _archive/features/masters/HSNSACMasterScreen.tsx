import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import type { HSNCode, SACCode } from "@ca-suite/shared";
import { api } from "../../lib/api";
import {
  Search, Upload, Download, Check, AlertCircle, Loader2, Trash2, Eye,
  RefreshCw, Plus, Filter, X, MoreVertical, ChevronDown, ChevronRight,
} from "lucide-react";

type CodeType = "HSN" | "SAC";
type MasterCode = HSNCode | SACCode;

interface UpsertFormData {
  code: string;
  type: CodeType;
  description: string;
  gstRate: number;
  cgstRate?: number;
  sgstRate?: number;
  validFrom?: string;
  validTo?: string;
}

const initialFormData: UpsertFormData = {
  code: "",
  type: "HSN",
  description: "",
  gstRate: 0,
};

export function HSNSACMasterScreen() {
  const [activeTab, setActiveTab] = useState<CodeType>("HSN");
  const [searchQuery, setSearchQuery] = useState("");
  const [codes, setCodes] = useState<MasterCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<UpsertFormData>(initialFormData);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [rateFilter, setRateFilter] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load codes on tab change
  useEffect(() => {
    loadCodes();
  }, [activeTab]);

  const loadCodes = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/masters/hsn-sac", {
        searchParams: { type: activeTab },
      });
      setCodes((response as any).codes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load codes");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/api/masters/hsn-sac/bulk", {
        body: formData,
      });

      const result = response as any;
      setCodes((prev) => [...prev]); // Refresh
      await loadCodes();

      alert(`Imported: ${result.imported}, Failed: ${result.failed}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleVerifyAll = async () => {
    setVerifying(true);
    setError("");

    try {
      const response = await api.post("/api/masters/hsn-sac/verify-all", {
        body: { type: activeTab },
      });

      const result = response as any;
      await loadCodes();
      alert(`Verified: ${result.verified}, Failed: ${result.failed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveCode = async () => {
    if (!formData.code || !formData.description || formData.gstRate === undefined) {
      setError("Code, description, and GST rate are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.post("/api/masters/hsn-sac", {
        body: formData,
      });

      setFormData(initialFormData);
      setShowForm(false);
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save code");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCode = async (code: string, type: CodeType) => {
    if (!confirm(`Delete ${type} code ${code}?`)) return;

    try {
      await api.delete(`/api/masters/hsn-sac/${code}`, {
        searchParams: { type },
      });
      await loadCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get("/api/masters/hsn-sac/export/csv", {
        searchParams: { type: activeTab },
      });

      const result = response as any;
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(result.csv));
      element.setAttribute("download", result.filename);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  // Filter codes
  const filteredCodes = useMemo(() => {
    return codes
      .filter((c) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            c.code.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .filter((c) => (rateFilter !== null ? c.gstRate === rateFilter : true))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [codes, searchQuery, rateFilter]);

  // Unique GST rates for filter
  const uniqueRates = useMemo(() => {
    return Array.from(new Set(codes.map((c) => c.gstRate))).sort((a, b) => a - b);
  }, [codes]);

  const selectedCount = selectedCodes.size;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">HSN/SAC Master</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-2 text-sm font-medium"
            >
              <Plus size={16} /> Add Code
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 flex items-center gap-2 text-sm font-medium"
            >
              <Download size={16} /> Export
            </button>
            <button
              onClick={handleVerifyAll}
              disabled={verifying || codes.length === 0}
              className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 flex items-center gap-2 text-sm font-medium disabled:opacity-50"
            >
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Verify
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 text-destructive rounded-md text-sm flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 border-b border-border">
          {(["HSN", "SAC"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "HSN" ? "HSN Codes" : "SAC Codes"} ({codes.length})
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border-b border-border bg-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Code
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder={activeTab === "HSN" ? "e.g., 0100" : "e.g., 998811"}
                className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description"
                className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                GST Rate (%)
              </label>
              <input
                type="number"
                step={0.01}
                value={formData.gstRate}
                onChange={(e) => setFormData({ ...formData, gstRate: parseFloat(e.target.value) })}
                placeholder="0"
                className="w-full px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 items-end">
              <button
                onClick={handleSaveCode}
                disabled={loading}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex-1 text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setFormData(initialFormData);
                }}
                className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="border-b border-border bg-card p-4 flex gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by code or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {uniqueRates.length > 1 && (
          <select
            value={rateFilter ?? ""}
            onChange={(e) => setRateFilter(e.target.value ? parseFloat(e.target.value) : null)}
            className="px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Rates</option>
            {uniqueRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(2)}%
              </option>
            ))}
          </select>
        )}

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md text-sm">
            {selectedCount} selected
            <button
              onClick={() => setSelectedCodes(new Set())}
              className="text-primary hover:text-primary/80"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filteredCodes.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p>No {activeTab} codes found</p>
              {searchQuery && <p className="text-xs mt-1">Try adjusting your search</p>}
            </div>
          </div>
        )}

        {!loading && filteredCodes.length > 0 && (
          <div className="divide-y divide-border">
            {filteredCodes.map((code) => {
              const isExpanded = expandedCode === code.code;
              const isSelected = selectedCodes.has(code.code);

              return (
                <div key={code.code} className="hover:bg-muted/50 transition-colors">
                  <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpandedCode(isExpanded ? null : code.code)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        const newSelected = new Set(selectedCodes);
                        if (e.target.checked) newSelected.add(code.code);
                        else newSelected.delete(code.code);
                        setSelectedCodes(newSelected);
                      }}
                      className="w-4 h-4 rounded border-border"
                    />

                    <button className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <code className="font-mono font-semibold text-sm">{code.code}</code>
                        <span className="text-xs text-muted-foreground">{code.description}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{code.gstRate.toFixed(2)}%</span>

                      {code.verified ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          <Check size={12} /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          <AlertCircle size={12} /> Pending
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCode(code.code, activeTab);
                      }}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 bg-muted/30 text-sm text-muted-foreground border-t border-border">
                      <div className="grid grid-cols-2 gap-2 py-2">
                        <div>
                          <span className="font-medium text-foreground">Source:</span> {code.source}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Valid From:</span> {new Date(code.validFrom).toLocaleDateString()}
                        </div>
                        {code.validTo && (
                          <div>
                            <span className="font-medium text-foreground">Valid To:</span> {new Date(code.validTo).toLocaleDateString()}
                          </div>
                        )}
                        {code.cgstRate !== undefined && (
                          <div>
                            <span className="font-medium text-foreground">CGST:</span> {code.cgstRate.toFixed(2)}%
                          </div>
                        )}
                        {code.sgstRate !== undefined && (
                          <div>
                            <span className="font-medium text-foreground">SGST:</span> {code.sgstRate.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
