/**
 * TIER 3.2: GST Portal Integration Screen
 * Handles OAuth and GSTR-1/2B fetching from GSTN
 */

import React, { useState, useEffect } from "react";
import { Button } from "@ca-suite/ui/button";
import { Input } from "@ca-suite/ui/input";
import { Card } from "@ca-suite/ui/card";
import { Alert, AlertDescription } from "@ca-suite/ui/alert";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface GstPortalStatus {
  configured: boolean;
  last_sync?: string;
  status?: string;
  last_gstr1_fetch?: string;
  last_gstr2b_fetch?: string;
}

export function GstPortalIntegrationScreen({ clientId, gstin }: { clientId: string; gstin: string }) {
  const [status, setStatus] = useState<GstPortalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedFy, setSelectedFy] = useState(getCurrentFinancialYear());
  const [gstrType, setGstrType] = useState<"gstr1" | "gstr2b">("gstr2b");

  useEffect(() => {
    fetchStatus();
  }, [clientId]);

  function getCurrentFinancialYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month < 3) {
      return `${year - 1}-${String(year).slice(-2)}`;
    }
    return `${year}-${String(year + 1).slice(-2)}`;
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/integrations/gst-portal/status/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load GST Portal status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setError("");
    setSuccess("");
    if (!token) {
      setError("Please enter portal token");
      return;
    }

    try {
      const res = await fetch(`/api/integrations/gst-portal/connect/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_token: token,
          refresh_token: refreshToken || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect");
      }

      setSuccess("Connected to GST Portal successfully!");
      setToken("");
      setRefreshToken("");
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function handleFetchGstr() {
    setFetching(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/integrations/gst-portal/gstr/${clientId}?type=${gstrType}&fy=${selectedFy}`);

      if (!res.ok) throw new Error(`Failed to fetch ${gstrType.toUpperCase()}`);
      const data = await res.json();

      setSuccess(`${gstrType.toUpperCase()} fetched successfully for FY ${selectedFy}`);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setFetching(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">GST Portal Integration</h2>
        <p className="text-gray-600">
          Connect to GST portal to fetch and reconcile GSTR-1 and GSTR-2B automatically
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
          <h3 className="text-lg font-semibold mb-4">Connect to GST Portal</h3>
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded text-sm text-blue-900">
              GSTIN: <strong>{gstin}</strong>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Portal Token</label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter GST portal OAuth token"
                type="password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Refresh Token (Optional)</label>
              <Input
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Enter refresh token for auto-renewal"
                type="password"
              />
            </div>
            <Button onClick={handleConnect} className="w-full">
              Connect GST Portal
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Fetch GSTR Returns</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Financial Year</label>
                <select
                  value={selectedFy}
                  onChange={(e) => setSelectedFy(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {[0, 1, 2, 3].map((i) => {
                    const year = new Date().getFullYear() - i;
                    const fy = `${year - 1}-${String(year).slice(-2)}`;
                    return (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">GSTR Type</label>
                <select
                  value={gstrType}
                  onChange={(e) => setGstrType(e.target.value as "gstr1" | "gstr2b")}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="gstr1">GSTR-1 (Sales)</option>
                  <option value="gstr2b">GSTR-2B (Purchases)</option>
                </select>
              </div>
            </div>

            <Button
              onClick={handleFetchGstr}
              disabled={fetching}
              className="w-full"
            >
              {fetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Fetch {gstrType.toUpperCase()}
            </Button>

            <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
              <div>
                <span className="text-gray-600">Last GSTR-1 fetch: </span>
                <span>{status.last_gstr1_fetch ? new Date(status.last_gstr1_fetch).toLocaleDateString() : "Never"}</span>
              </div>
              <div>
                <span className="text-gray-600">Last GSTR-2B fetch: </span>
                <span>{status.last_gstr2b_fetch ? new Date(status.last_gstr2b_fetch).toLocaleDateString() : "Never"}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-gray-50">
        <h3 className="font-semibold mb-2">Features</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Auto-fetch GSTR-1 and GSTR-2B from portal</li>
          <li>• Instant reconciliation with CA Suite registers</li>
          <li>• Identify mismatches automatically</li>
          <li>• One-click correction suggestions</li>
          <li>• Amendment generation for discrepancies</li>
        </ul>
      </Card>
    </div>
  );
}
