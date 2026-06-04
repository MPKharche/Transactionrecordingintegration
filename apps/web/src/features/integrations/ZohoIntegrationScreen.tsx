/**
 * TIER 3.1: Zoho Books Integration Screen
 * Handles two-way sync with Zoho Books
 */

import React, { useState, useEffect } from "react";
import { Button } from "@ca-suite/ui/button";
import { Input } from "@ca-suite/ui/input";
import { Card } from "@ca-suite/ui/card";
import { Alert, AlertDescription } from "@ca-suite/ui/alert";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ZohoSyncStatus {
  configured: boolean;
  last_sync?: string;
  status?: string;
  error?: string;
  sync_interval_minutes?: number;
}

export function ZohoIntegrationScreen({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<ZohoSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch current sync status
  useEffect(() => {
    fetchStatus();
  }, [clientId]);

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/integrations/zoho/status/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load Zoho status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setError("");
    setSuccess("");
    if (!apiKey || !orgId) {
      setError("Please enter API key and Organization ID");
      return;
    }

    try {
      const res = await fetch(`/api/integrations/zoho/connect/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, org_id: orgId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect");
      }

      setSuccess("Connected to Zoho successfully!");
      setApiKey("");
      setOrgId("");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/integrations/zoho/sync/${clientId}`, {
        method: "POST",
      });

      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();

      setSuccess(
        `Sync complete: ${data.invoicesPulled} pulled, ${data.invoicesPushed} pushed`
      );
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Zoho Books Integration</h2>
        <p className="text-gray-600">
          Sync invoices and registers with Zoho Books for seamless accounting
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {!status?.configured ? (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Connect to Zoho Books</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Zoho API key"
                type="password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Organization ID</label>
              <Input
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="Enter Zoho Organization ID"
              />
            </div>
            <Button onClick={handleConnect} className="w-full">
              Connect Zoho Account
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Sync Status</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                status.status === "success"
                  ? "bg-green-100 text-green-800"
                  : status.status === "failed"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
              }`}>
                {status.status || "idle"}
              </span>
            </div>

            {status.last_sync && (
              <div className="text-sm">
                <span className="text-gray-600">Last sync: </span>
                <span>{new Date(status.last_sync).toLocaleString()}</span>
              </div>
            )}

            {status.error && (
              <div className="text-sm text-red-600">Error: {status.error}</div>
            )}

            <div className="text-sm">
              <span className="text-gray-600">Sync interval: </span>
              <span>{status.sync_interval_minutes || 360} minutes</span>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="primary"
              >
                {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sync Now
              </Button>
              <Button
                onClick={() => setStatus(null)}
                variant="outline"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-gray-50">
        <h3 className="font-semibold mb-2">How it works</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Pull invoices from Zoho Books</li>
          <li>• Push validated GST registers back to Zoho</li>
          <li>• Automatic periodic sync (configurable interval)</li>
          <li>• Conflict resolution for simultaneous edits</li>
        </ul>
      </Card>
    </div>
  );
}
