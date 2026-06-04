/**
 * TIER 3.3: Email Forwarding Configuration Screen
 * Handles email-based document uploads and rules
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { Loader2, Copy, CheckCircle2, Plus, Trash2, Mail, Zap } from "lucide-react";

interface Rule {
  id: string;
  trigger: "subject" | "from_domain" | "recipient";
  condition: string;
  action: "parse_invoice" | "auto_assign" | "skip";
  actionValue?: string;
}

interface EmailStats {
  totalUploaded: number;
  last7Days: number;
  successRate: number;
}

export function EmailForwardingScreen({ isDark }: { isDark: boolean }) {
  const [loading, setLoading] = useState(true);
  const [forwardAddress, setForwardAddress] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<EmailStats>({ totalUploaded: 0, last7Days: 0, successRate: 0 });
  const [testSending, setTestSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState<Partial<Rule>>({ trigger: "subject", action: "parse_invoice" });

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      // Mock data
      setForwardAddress(`invoices-${Math.random().toString(36).substr(2, 6)}@ca-saas.mail.app`);
      setRules([
        {
          id: "1",
          trigger: "subject",
          condition: "INV",
          action: "parse_invoice",
        },
        {
          id: "2",
          trigger: "from_domain",
          condition: "@example.com",
          action: "auto_assign",
          actionValue: "client-001",
        },
      ]);
      setStats({
        totalUploaded: 234,
        last7Days: 18,
        successRate: 96.5,
      });
    } catch (error) {
      toast.error("Failed to load email configuration");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(forwardAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Email address copied to clipboard");
  }

  async function handleSendTest() {
    try {
      setTestSending(true);
      // Simulate sending test email
      await new Promise((r) => setTimeout(r, 1500));
      toast.success("Test email sent successfully");
    } catch (error) {
      toast.error("Failed to send test email");
    } finally {
      setTestSending(false);
    }
  }

  function handleAddRule() {
    if (!newRule.trigger || !newRule.condition) {
      toast.error("Please fill all required fields");
      return;
    }

    const rule: Rule = {
      id: Math.random().toString(36).substr(2, 9),
      trigger: newRule.trigger as "subject" | "from_domain" | "recipient",
      condition: newRule.condition,
      action: newRule.action as "parse_invoice" | "auto_assign" | "skip",
      actionValue: newRule.actionValue,
    };

    setRules((prev) => [rule, ...prev]);
    setNewRule({ trigger: "subject", action: "parse_invoice" });
    setShowNewRule(false);
    toast.success("Rule added");
  }

  function handleDeleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success("Rule deleted");
  }

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Email Forwarding" />
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
          title="Email Forwarding"
          subtitle="Configure email-based invoice forwarding and parsing rules"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Forward Address */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Your Unique Forward Address
            </h3>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Forward all invoices to this email address. Each email will be automatically
                parsed and added to your register.
              </p>

              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-muted rounded-lg border border-input font-mono text-sm break-all">
                  {forwardAddress}
                </div>
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-shrink-0"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>

              <Button
                onClick={handleSendTest}
                disabled={testSending}
                variant="outline"
                className="gap-2"
              >
                {testSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Rules Builder */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Parsing Rules ({rules.length})
              </h3>
              <Button
                onClick={() => setShowNewRule(!showNewRule)}
                size="sm"
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </Button>
            </div>

            {/* New Rule Form */}
            {showNewRule && (
              <Card className="p-4 bg-muted/50 mb-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Trigger Type
                      </label>
                      <select
                        value={newRule.trigger || ""}
                        onChange={(e) =>
                          setNewRule({ ...newRule, trigger: e.target.value as Rule["trigger"] })
                        }
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      >
                        <option value="subject">Subject Contains</option>
                        <option value="from_domain">From Domain</option>
                        <option value="recipient">Recipient Email</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Condition
                      </label>
                      <input
                        type="text"
                        value={newRule.condition || ""}
                        onChange={(e) =>
                          setNewRule({ ...newRule, condition: e.target.value })
                        }
                        placeholder={
                          newRule.trigger === "subject"
                            ? "e.g. INV, invoice"
                            : "e.g. example.com"
                        }
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Action
                      </label>
                      <select
                        value={newRule.action || ""}
                        onChange={(e) =>
                          setNewRule({ ...newRule, action: e.target.value as Rule["action"] })
                        }
                        className="w-full px-3 py-2 border border-input rounded-md bg-background"
                      >
                        <option value="parse_invoice">Parse as Invoice</option>
                        <option value="auto_assign">Auto-Assign to Client</option>
                        <option value="skip">Skip / Archive</option>
                      </select>
                    </div>

                    {newRule.action === "auto_assign" && (
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={newRule.actionValue || ""}
                          onChange={(e) =>
                            setNewRule({ ...newRule, actionValue: e.target.value })
                          }
                          placeholder="e.g. client-001"
                          className="w-full px-3 py-2 border border-input rounded-md bg-background"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleAddRule} size="sm" className="flex-1">
                      Add Rule
                    </Button>
                    <Button
                      onClick={() => {
                        setShowNewRule(false);
                        setNewRule({ trigger: "subject", action: "parse_invoice" });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Rules List */}
            <div className="space-y-2">
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No rules created. Add one to automate invoice parsing.
                </p>
              ) : (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-4 bg-muted rounded-lg border border-input flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {rule.trigger === "subject" && "Subject contains"}
                        {rule.trigger === "from_domain" && "From domain"}
                        {rule.trigger === "recipient" && "Recipient email"}
                        {" "}
                        <span className="font-mono bg-background px-2 py-1 rounded text-xs ml-2">
                          {rule.condition}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rule.action === "parse_invoice" && "Parse as invoice"}
                        {rule.action === "auto_assign" && `Auto-assign to ${rule.actionValue}`}
                        {rule.action === "skip" && "Skip / Archive"}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleDeleteRule(rule.id)}
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Statistics */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Email Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Uploaded</p>
                <p className="text-3xl font-bold mt-2">{stats.totalUploaded}</p>
                <p className="text-xs text-muted-foreground mt-1">documents</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Last 7 Days</p>
                <p className="text-3xl font-bold mt-2">{stats.last7Days}</p>
                <p className="text-xs text-muted-foreground mt-1">new documents</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {stats.successRate}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">parsed correctly</p>
              </div>
            </div>
          </Card>

          {/* Help Section */}
          <Card className="p-6 bg-muted/50">
            <h3 className="font-semibold mb-3">Troubleshooting</h3>
            <div className="space-y-3 text-sm">
              <div>
                <h4 className="font-medium mb-1">Emails not being parsed?</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Check if your forwarding rules match the email headers</li>
                  <li>Ensure the forward address is added to your email system</li>
                  <li>Send a test email to verify</li>
                  <li>Check your email logs for any errors</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-1">Need help with rules?</h4>
                <p className="text-muted-foreground">
                  Rules are executed in order. Use them to automatically categorize and
                  parse incoming invoices.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
