/**
 * TIER 3.1: Zoho Books Integration Screen
 * Handles two-way sync with Zoho Books
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "../../app/components/ui/alert-dialog";
import { Loader2, CheckCircle2, AlertCircle, Power, RotateCcw } from "lucide-react";

interface ZohoStatus {
  connected: boolean;
  needsOrgSelection?: boolean;
  orgId?: string;
  orgName?: string;
  clientGstin?: string;
  lastSyncTime?: string;
  invoicesSynced?: number;
  registersPushed?: number;
  syncStatus?: "success" | "failed" | "in_progress";
  error?: string;
}

type ZohoOrgCandidate = {
  organizationId: string;
  name: string;
  gstin: string | null;
  isCaFirm: boolean;
  gstinMatch: boolean;
};

export function ZohoIntegrationScreen({ isDark }: { isDark: boolean }) {
  const { clients } = useAppData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";
  const [status, setStatus] = useState<ZohoStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncInterval, setSyncInterval] = useState("6h");
  const [orgCandidates, setOrgCandidates] = useState<ZohoOrgCandidate[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [bindingOrg, setBindingOrg] = useState(false);
  const [clientGstin, setClientGstin] = useState("");

  useEffect(() => {
    void loadStatus();
  }, [clientId]);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      const matched = searchParams.get("orgMatched") === "gstin";
      toast.success(
        matched
          ? "Zoho connected — organization matched by GSTIN"
          : "Zoho Books connected"
      );
      void loadStatus();
    }
    if (searchParams.get("selectOrg") === "true") {
      toast.message("Select the Zoho Books organization for this client");
      void loadOrgCandidates();
    }
    if (searchParams.get("error") === "oauth_state") {
      toast.error("Zoho sign-in expired or was interrupted. Click Connect again.");
    }
  }, [searchParams]);

  function selectClient(nextClientId: string) {
    const params = new URLSearchParams(searchParams);
    if (nextClientId) params.set("clientId", nextClientId);
    else params.delete("clientId");
    const q = params.toString();
    navigate({ pathname: "/integrations/zoho", search: q ? `?${q}` : "" }, { replace: true });
  }

  async function loadStatus() {
    try {
      setLoading(true);
      if (!clientId) {
        setStatus({ connected: false });
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/integrations/zoho/status/${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load status");
      const data = await res.json();
      setStatus({
        connected: Boolean(data.connected),
        needsOrgSelection: Boolean(data.needsOrgSelection),
        orgId: data.orgId,
        orgName: data.orgName,
        clientGstin: data.clientGstin,
        lastSyncTime: data.lastSyncAt,
        invoicesSynced: data.synced,
        registersPushed: data.pending,
        syncStatus: data.errors > 0 ? "failed" : "success",
      });
      setClientGstin(data.clientGstin ?? "");
      if (data.needsOrgSelection) {
        void loadOrgCandidates();
      }
    } catch (error) {
      toast.error("Failed to load integration status");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgCandidates() {
    if (!clientId) return;
    try {
      const res = await fetch(`/api/integrations/zoho/organizations/${clientId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load Zoho organizations");
      const data = await res.json();
      setOrgCandidates(data.candidates ?? []);
      setClientGstin(data.client?.gstin ?? "");
      const firstMatch = (data.candidates as ZohoOrgCandidate[] | undefined)?.find((c) => c.gstinMatch);
      setSelectedOrgId(firstMatch?.organizationId ?? data.candidates?.[0]?.organizationId ?? "");
    } catch {
      toast.error("Could not load Zoho organizations — try Connect again");
    }
  }

  async function handleBindOrg(confirmGstinMismatch = false) {
    if (!clientId || !selectedOrgId) {
      toast.error("Select a Zoho organization");
      return;
    }
    setBindingOrg(true);
    try {
      const res = await fetch(`/api/integrations/zoho/bind-org/${clientId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zohoOrgId: selectedOrgId, confirmGstinMismatch }),
      });
      const data = await res.json();
      if (res.status === 409 && !confirmGstinMismatch) {
        const ok = window.confirm(
          `GSTIN mismatch: client ${data.clientGstin} vs Zoho org ${data.orgGstin} (${data.orgName}). Link anyway?`
        );
        if (ok) return handleBindOrg(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to link organization");
      toast.success(`Linked to ${data.orgName ?? "Zoho org"}`);
      selectClient(clientId);
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link organization");
    } finally {
      setBindingOrg(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      if (!clientId) {
        toast.error("Select a client first");
        return;
      }
      const res = await fetch(`/api/integrations/zoho/sync/${clientId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast.success(`Queued ${data.queued} document(s) for sync`);
      await loadStatus();
    } catch (error) {
      toast.error("Sync failed");
      setStatus((prev) => ({ ...prev, syncStatus: "failed", error: "Sync request failed" }));
    } finally {
      setSyncing(false);
    }
  }

  async function handleOAuthConnect() {
    try {
      if (!clientId) {
        toast.error("Select a client first");
        return;
      }
      window.location.href = `/api/oauth/zoho?clientId=${encodeURIComponent(clientId)}`;
    } catch (error) {
      toast.error("Failed to initiate connection");
    }
  }

  async function handleDisconnect() {
    try {
      setStatus({ connected: false });
      toast.success("Zoho account disconnected");
    } catch (error) {
      toast.error("Failed to disconnect");
    }
  }

  if (loading && clientId) {
    return (
      <div className="p-6">
        <PageHeader title="Zoho Books Integration" subtitle="Sync invoices and registers with Zoho" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="Zoho Books Integration"
          subtitle="Sync invoices and registers with Zoho Books"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <Card className="p-4">
            <label htmlFor="zoho-client" className="block text-sm font-medium mb-2">
              Client (MSME)
            </label>
            <select
              id="zoho-client"
              value={clientId}
              onChange={(e) => selectClient(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              Each client maps to one Zoho Books organization. OAuth tokens are stored per client.
            </p>
          </Card>

          {!clientId ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Choose a client above to view connection status or connect Zoho Books.
            </Card>
          ) : status.needsOrgSelection ? (
            <>
              <Card className="p-6 border-amber-200 bg-amber-50/50">
                <div className="flex gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-950">Choose Zoho organization</h3>
                    <p className="text-sm text-amber-900/80 mt-1">
                      OAuth succeeded. Pick the Books org for this client — we never auto-link the CA
                      firm org ({clientGstin ? `client GSTIN: ${clientGstin}` : "check GSTIN matches"}).
                    </p>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {orgCandidates.map((org) => (
                    <label
                      key={org.organizationId}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                        selectedOrgId === org.organizationId
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <input
                        type="radio"
                        name="zoho-org"
                        checked={selectedOrgId === org.organizationId}
                        onChange={() => setSelectedOrgId(org.organizationId)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{org.name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          Org ID {org.organizationId}
                          {org.gstin ? ` · GSTIN ${org.gstin}` : ""}
                        </p>
                        {org.gstinMatch && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            GSTIN match
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                  {orgCandidates.length === 0 && (
                    <p className="text-sm text-muted-foreground">Loading organizations…</p>
                  )}
                </div>
                <Button
                  className="mt-4 gap-2"
                  disabled={bindingOrg || !selectedOrgId}
                  onClick={() => void handleBindOrg()}
                >
                  {bindingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm organization link
                </Button>
              </Card>
            </>
          ) : status.connected ? (
            <>
              {/* Status Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-6 border-green-200 bg-green-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-green-900">Integration Status</p>
                      <p className="text-2xl font-bold text-green-900 mt-2 flex items-center gap-2">
                        <CheckCircle2 className="w-6 h-6" />
                        Connected
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Organization</p>
                  <p className="text-lg font-bold mt-2">{status.orgName}</p>
                </Card>

                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Last Sync</p>
                  <p className="text-lg font-bold mt-2">
                    {status.lastSyncTime
                      ? new Date(status.lastSyncTime).toLocaleString("en-IN")
                      : "Never"}
                  </p>
                </Card>

                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Sync Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    {status.syncStatus === "success" && (
                      <>
                        <div className="w-2 h-2 rounded-full bg-green-600" />
                        <span className="text-sm font-medium text-green-600">
                          Healthy
                        </span>
                      </>
                    )}
                    {status.syncStatus === "in_progress" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                        <span className="text-sm font-medium text-amber-600">
                          Syncing...
                        </span>
                      </>
                    )}
                    {status.syncStatus === "failed" && (
                      <>
                        <div className="w-2 h-2 rounded-full bg-red-600" />
                        <span className="text-sm font-medium text-red-600">
                          Failed
                        </span>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* Sync Stats */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Sync Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Invoices Synced</p>
                    <p className="text-3xl font-bold mt-2">{status.invoicesSynced}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      from your register
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Registers Pushed</p>
                    <p className="text-3xl font-bold mt-2">{status.registersPushed}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      validated and synced
                    </p>
                  </div>
                </div>
              </Card>

              {/* Error Messages */}
              {status.error && (
                <Card className="p-4 border-red-200 bg-red-50">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-900">Sync Error</h4>
                      <p className="text-sm text-red-800 mt-1">{status.error}</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Sync Controls */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Manual Sync</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Auto-Sync Interval
                    </label>
                    <select
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="1h">Every 1 hour</option>
                      <option value="6h">Every 6 hours</option>
                      <option value="12h">Every 12 hours</option>
                      <option value="24h">Every 24 hours</option>
                      <option value="manual">Manual only</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSync}
                      disabled={syncing}
                      className="gap-2 flex-1"
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          Sync Now
                        </>
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <Power className="w-4 h-4" />
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Disconnect Zoho</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure? Auto-sync will stop and you'll need to reconnect to resume.
                        </AlertDialogDescription>
                        <div className="flex gap-2 justify-end">
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDisconnect}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>

              {/* How It Works */}
              <Card className="p-6 bg-muted/50">
                <h3 className="font-semibold mb-3">How It Works</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">1.</span>
                    <span>Pull invoices from your register</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">2.</span>
                    <span>Validate against Zoho Books database</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">3.</span>
                    <span>Push corrected GST registers back to Zoho</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary font-bold">4.</span>
                    <span>Automatic periodic sync (configurable)</span>
                  </li>
                </ul>
              </Card>
            </>
          ) : (
            <>
              {/* Connect Screen */}
              <Card className="p-12 text-center border-2 border-dashed">
                <Power className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Connect to Zoho Books</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Securely connect your Zoho Books account to sync invoices and GST
                  registers automatically.
                </p>
                <Button onClick={handleOAuthConnect} className="gap-2">
                  <Power className="w-4 h-4" />
                  Connect to Zoho
                </Button>
              </Card>

              {/* Benefits */}
              <Card className="p-6">
                <h3 className="font-semibold mb-4">Benefits of Integration</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>Automatic invoice sync from Zoho</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>Push validated GST data back</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>Real-time sync status monitoring</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>Error detection and resolution</span>
                  </li>
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
