import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { api, currentFinancialYear } from "../../lib/api";
import { Button } from "../../app/components/ui/button";
import { Input } from "../../app/components/ui/input";
import { Card } from "../../app/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../app/components/ui/alert-dialog";
import { Calendar, Trash2, CheckCircle2, AlertCircle, Clock, X } from "lucide-react";

type DeadlineRow = Awaited<ReturnType<typeof api.filingDeadlines.list>>["deadlines"][number];

const FILING_TYPE_OPTIONS = [
  { value: "GSTR1", label: "GSTR-1 (Outward Supplies)" },
  { value: "GSTR2B", label: "GSTR-2B (Inward Supplies)" },
  { value: "GSTR3B", label: "GSTR-3B (Monthly Returns)" },
] as const;

export function FilingDeadlineScreen({ isDark }: { isDark: boolean }) {
  const { clients } = useAppData();
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [readiness, setReadiness] = useState({
    docsLocked: 0,
    totalDocs: 0,
    issuesFixed: 0,
    totalIssues: 0,
    clientsRegistered: 0,
    totalClients: 0,
  });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [formData, setFormData] = useState({ filingType: "", dueDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadDeadlines = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.filingDeadlines.list({
        financialYear,
        clientId: filterClientId || undefined,
      });
      setDeadlines(data.deadlines);
      setReadiness(data.readiness);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load deadlines");
    } finally {
      setLoading(false);
    }
  }, [financialYear, filterClientId]);

  useEffect(() => {
    void loadDeadlines();
  }, [loadDeadlines]);

  async function handleSeedDeadlines() {
    const clientId = filterClientId || clients[0]?.id;
    if (!clientId) {
      toast.error("Add a client first");
      return;
    }
    try {
      setSyncing(true);
      const result = await api.filingDeadlines.seed(clientId, financialYear);
      toast.success(
        result.created > 0
          ? `Seeded ${result.created} deadline(s) from compliance calendar`
          : "Deadlines already up to date"
      );
      await loadDeadlines();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Seed failed");
    } finally {
      setSyncing(false);
    }
  }

  function getStatusColor(status: string, daysLeft: number): string {
    if (status === "filed") return "text-green-600";
    if (status === "overdue" || daysLeft < 0) return "text-red-600";
    if (daysLeft <= 7) return "text-amber-600";
    return "text-green-600";
  }

  function getStatusBg(status: string, daysLeft: number): string {
    if (status === "filed") return "bg-green-50 border-green-200";
    if (status === "overdue" || daysLeft < 0) return "bg-red-50 border-red-200";
    if (daysLeft <= 7) return "bg-amber-50 border-amber-200";
    return "bg-green-50 border-green-200";
  }

  function getStatusIcon(status: string, daysLeft: number) {
    if (status === "filed") return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (daysLeft < 0 || daysLeft <= 7) return <AlertCircle className="w-5 h-5 text-amber-600" />;
    return <Clock className="w-5 h-5 text-green-600" />;
  }

  async function handleAddDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId || !formData.filingType || !formData.dueDate) {
      toast.error("Select client, filing type, and due date");
      return;
    }

    try {
      setSubmitting(true);
      await api.filingDeadlines.create(selectedClientId, {
        financial_year: financialYear,
        filing_type: formData.filingType as "GSTR1" | "GSTR2B" | "GSTR3B",
        due_date: new Date(formData.dueDate).toISOString(),
      });
      setFormData({ filingType: "", dueDate: "" });
      setFormOpen(false);
      toast.success("Deadline added");
      await loadDeadlines();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add deadline");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDeadline(id: string) {
    try {
      await api.filingDeadlines.delete(id);
      toast.success("Deadline deleted");
      await loadDeadlines();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  }

  async function handleMarkFiled(id: string) {
    try {
      await api.filingDeadlines.patch(id, { status: "filed" });
      toast.success("Marked as filed");
      await loadDeadlines();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update");
    }
  }

  const readyStats = useMemo(() => {
    const filedCount = deadlines.filter((d) => d.status === "filed").length;
    const overdueCount = deadlines.filter((d) => d.isOverdue && d.status !== "filed").length;
    return { filedCount, overdueCount };
  }, [deadlines]);

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Filing Deadlines" subtitle="Track GST filing deadlines and compliance status" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="Filing Deadlines"
          subtitle="Track GST filing deadlines — mark returns filed manually after GST portal submission"
          action={
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => void handleSeedDeadlines()} disabled={syncing} className="gap-2">
                <Calendar className="w-4 h-4" />
                Seed calendar
              </Button>
              <Button onClick={() => setFormOpen(!formOpen)} className="gap-2">
                <Calendar className="w-4 h-4" />
                Add deadline
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Financial year
              </label>
              <Input
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                placeholder="2025-26"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Filter by client
              </label>
              <select
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.gstin})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Invoices locked" value={readiness.docsLocked} color="#10b981" />
            <KpiCard label="Returns filed" value={readyStats.filedCount} color="#3b82f6" />
            <KpiCard label="Overdue" value={readyStats.overdueCount} color="#ef4444" />
          </div>

          {formOpen && (
            <Card className="p-6 bg-muted/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Add new deadline</h3>
                <button type="button" onClick={() => setFormOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddDeadline} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Client</label>
                  <select
                    required
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="">Select client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Filing type</label>
                  <select
                    value={formData.filingType}
                    onChange={(e) => setFormData({ ...formData, filingType: e.target.value })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    required
                  >
                    <option value="">Select filing type</option>
                    {FILING_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Due date</label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    required
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={submitting} className="flex-1">
                    {submitting ? "Adding..." : "Add deadline"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-3">
            {deadlines.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No deadlines yet.</p>
                <Button variant="outline" onClick={() => void handleSeedDeadlines()}>
                  Seed from compliance calendar
                </Button>
              </Card>
            ) : (
              deadlines.map((deadline) => {
                const daysLeft = deadline.daysUntilDue;
                const isReady =
                  readiness.docsLocked >= Math.max(readiness.totalDocs * 0.9, 1) &&
                  readiness.issuesFixed >= Math.max(readiness.totalIssues * 0.95, 0);

                return (
                  <Card
                    key={deadline.id}
                    className={`p-5 border-l-4 transition-all ${getStatusBg(deadline.status, daysLeft)}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <div className="mt-0.5">{getStatusIcon(deadline.status, daysLeft)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">{deadline.filingTypeLabel}</h4>
                            {!filterClientId && (
                              <span className="text-xs text-muted-foreground">{deadline.clientName}</span>
                            )}
                            {isReady && deadline.status !== "filed" && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                Ready to file
                              </span>
                            )}
                            {deadline.status === "filed" && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                Filed
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-medium mt-1 ${getStatusColor(deadline.status, daysLeft)}`}>
                            {daysLeft < 0
                              ? `Overdue by ${Math.abs(daysLeft)} days`
                              : daysLeft === 0
                                ? "Due today"
                                : `${daysLeft} days left`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(deadline.dueDate).toLocaleDateString("en-IN", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            <div>
                              {readiness.docsLocked} / {readiness.totalDocs} invoices locked
                            </div>
                            <div>
                              {readiness.issuesFixed} / {readiness.totalIssues} issues resolved
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {deadline.status !== "filed" && (
                          <Button size="sm" variant="outline" onClick={() => void handleMarkFiled(deadline.id)} className="gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            Mark filed
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogTitle>Delete deadline</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove this filing deadline? This cannot be undone.
                            </AlertDialogDescription>
                            <div className="flex gap-2 justify-end">
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void handleDeleteDeadline(deadline.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </div>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
