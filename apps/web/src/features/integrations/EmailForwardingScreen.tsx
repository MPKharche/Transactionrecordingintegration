/**
 * TIER 3.3: Email Forwarding Configuration Screen
 * Handles email-based document uploads
 */

import React, { useState, useEffect } from "react";
import { Button } from "@ca-suite/ui/button";
import { Card } from "@ca-suite/ui/card";
import { Alert, AlertDescription } from "@ca-suite/ui/alert";
import { Loader2, CheckCircle, AlertCircle, Copy } from "lucide-react";

interface EmailConfig {
  forward_address: string;
  parse_rules: any;
  client_mappings: Record<string, string>;
  is_active: boolean;
}

export function EmailForwardingScreen() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/integrations/email/config");
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else if (res.status === 404) {
        // Not configured yet - try to set up
        await setupEmailForwarding();
      } else {
        throw new Error("Failed to fetch config");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load email configuration");
    } finally {
      setLoading(false);
    }
  }

  async function setupEmailForwarding() {
    try {
      const res = await fetch("/api/integrations/email/setup", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Setup failed");
      const data = await res.json();
      setConfig({
        forward_address: data.forward_address,
        parse_rules: {},
        client_mappings: {},
        is_active: true,
      });
      setSuccess("Email forwarding enabled successfully!");
    } catch (err) {
      console.error(err);
      setError("Failed to set up email forwarding");
    }
  }

  function copyToClipboard() {
    if (config?.forward_address) {
      navigator.clipboard.writeText(config.forward_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Email Forwarding</h2>
        <p className="text-gray-600">
          Forward invoices to a unique email address for automatic upload and processing
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

      {config ? (
        <>
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Your Unique Forward Address</h3>
            <div className="flex items-center gap-2 bg-gray-100 p-3 rounded-md">
              <code className="flex-1 font-mono text-sm">{config.forward_address}</code>
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Send invoices to this address. Each email should have invoice PDFs as attachments.
            </p>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Parsing Rules</h3>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded">
                <p className="text-sm font-medium text-blue-900 mb-2">Auto-Detection Rules:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Subject contains "INV" → Parse as invoice</li>
                  <li>• Attachment is PDF → Extract content</li>
                  <li>• Sender domain in mappings → Assign to client</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Client Domain Mappings</label>
                <p className="text-sm text-gray-600 mb-2">
                  Configure which sender domains map to which clients for automatic assignment.
                </p>
                <div className="space-y-2">
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <p className="text-gray-600">Configure via API or contact support for domain mappings</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-green-50">
            <h3 className="font-semibold text-green-900 mb-2">Status: Active</h3>
            <p className="text-sm text-green-800">
              Email forwarding is enabled. Start sending invoices to your unique address!
            </p>
          </Card>

          <Card className="p-6 bg-gray-50">
            <h3 className="font-semibold mb-2">How it works</h3>
            <ol className="space-y-2 text-sm text-gray-600">
              <li>1. Forward invoice PDFs to your unique address</li>
              <li>2. System automatically extracts invoice metadata</li>
              <li>3. Documents are uploaded to the correct client</li>
              <li>4. Processing pipeline begins automatically</li>
              <li>5. You receive notification when ready for review</li>
            </ol>
          </Card>
        </>
      ) : (
        <Card className="p-6">
          <p className="text-gray-600 mb-4">Email forwarding not configured</p>
          <Button onClick={setupEmailForwarding} disabled={setting}>
            {setting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enable Email Forwarding
          </Button>
        </Card>
      )}
    </div>
  );
}
