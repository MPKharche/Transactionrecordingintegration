/**
 * TIER 3.1: Zoho Books Integration Screen
 * Handles two-way sync with Zoho Books
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "../../app/components/ui/alert-dialog";
import { Loader2, CheckCircle2, AlertCircle, Power, RotateCcw } from "lucide-react";

interface ZohoStatus {
  connected: boolean;
  orgName?: string;
  lastSyncTime?: string;
  invoicesSynced?: number;
  registersPushed?: number;
  syncStatus?: "success" | "failed" | "in_progress";
  error?: string;
}

export function ZohoIntegrationScreen({ isDark }: { isDark: boolean }) {
  const { docs } = useAppData();
  const [status, setStatus] = useState<ZohoStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncInterval, setSyncInterval] = useState("6h");

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      setLoading(true);
      // Mock data - in production, fetch from API
      setStatus({
        connected: true,
        orgName: "Demo Company Ltd.",
        lastSyncTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        invoicesSynced: 245,
        registersPushed: 152,
        syncStatus: "success",
      });
    } catch (error) {
      toast.error("Failed to load integration status");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      // Simulate sync
      await new Promise((r) => setTimeout(r, 2000));
      setStatus((prev) => ({
        ...prev,
        lastSyncTime: new Date().toISOString(),
        syncStatus: "success",
      }));
      toast.success("Sync completed successfully");
    } catch (error) {
      toast.error("Sync failed");
      setStatus((prev) => ({ ...prev, syncStatus: "failed", error: "Connection timeout" }));
    } finally {
      setSyncing(false);
    }
  }

  async function handleOAuthConnect() {
    try {
      // In production, redirect to OAuth flow
      window.open(`/oauth/zoho?tenant=${Date.now()}`, "_blank", "width=600,height=600");
      toast.success("Opening Zoho connection dialog...");
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

  if (loading) {
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
          {status.connected ? (
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
