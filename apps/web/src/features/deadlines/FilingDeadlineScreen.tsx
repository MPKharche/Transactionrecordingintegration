import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { api } from "../../lib/api";
import { INR } from "../../lib/format";
import { Button } from "../../app/components/ui/button";
import { Input } from "../../app/components/ui/input";
import { Card } from "../../app/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "../../app/components/ui/alert-dialog";
import { Calendar, Trash2, CheckCircle2, AlertCircle, Clock, X } from "lucide-react";

interface FilingDeadline {
  id: string;
  filingType: string;
  dueDate: string;
  status: "pending" | "filed" | "overdue";
  docsLocked: number;
  clientsRegistered: number;
  issuesFixed: number;
  totalDocs: number;
  totalClients: number;
  totalIssues: number;
  createdAt: string;
}

export function FilingDeadlineScreen({ isDark }: { isDark: boolean }) {
  const { docs, clients } = useAppData();
  const [deadlines, setDeadlines] = useState<FilingDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({ filingType: "", dueDate: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDeadlines();
  }, []);

  async function loadDeadlines() {
    try {
      setLoading(true);
      // Mock data - in production, fetch from API
      const mockDeadlines: FilingDeadline[] = [
        {
          id: "1",
          filingType: "GSTR-1",
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          status: "pending",
          docsLocked: 45,
          clientsRegistered: 8,
          issuesFixed: 128,
          totalDocs: 50,
          totalClients: 10,
          totalIssues: 135,
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          filingType: "GSTR-2B",
          dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          status: "pending",
          docsLocked: 30,
          clientsRegistered: 5,
          issuesFixed: 85,
          totalDocs: 35,
          totalClients: 10,
          totalIssues: 92,
          createdAt: new Date().toISOString(),
        },
      ];
      setDeadlines(mockDeadlines);
    } catch (error) {
      toast.error("Failed to load deadlines");
    } finally {
      setLoading(false);
    }
  }

  function getDaysUntilDue(dueDate: string): number {
    const due = new Date(dueDate);
    const today = new Date();
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function getStatusColor(status: string, daysLeft: number): string {
    if (status === "filed") return "text-green-600";
    if (status === "overdue") return "text-red-600";
    if (daysLeft < 0) return "text-red-600";
    if (daysLeft <= 7) return "text-amber-600";
    return "text-green-600";
  }

  function getStatusBg(status: string, daysLeft: number): string {
    if (status === "filed") return "bg-green-50 border-green-200";
    if (status === "overdue") return "bg-red-50 border-red-200";
    if (daysLeft < 0) return "bg-red-50 border-red-200";
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
    if (!formData.filingType || !formData.dueDate) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      setSubmitting(true);
      const newDeadline: FilingDeadline = {
        id: Math.random().toString(36).substr(2, 9),
        filingType: formData.filingType,
        dueDate: formData.dueDate,
        status: "pending",
        docsLocked: 0,
        clientsRegistered: 0,
        issuesFixed: 0,
        totalDocs: docs.length,
        totalClients: clients.length,
        totalIssues: 0,
        createdAt: new Date().toISOString(),
      };

      setDeadlines((prev) => [newDeadline, ...prev]);
      setFormData({ filingType: "", dueDate: "" });
      setFormOpen(false);
      toast.success("Deadline added successfully");
    } catch (error) {
      toast.error("Failed to add deadline");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDeadline(id: string) {
    try {
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
      toast.success("Deadline deleted");
    } catch (error) {
      toast.error("Failed to delete deadline");
    }
  }

  async function handleMarkFiled(id: string) {
    try {
      setDeadlines((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "filed" } : d))
      );
      toast.success("Deadline marked as filed");
    } catch (error) {
      toast.error("Failed to update deadline");
    }
  }

  const readyStats = useMemo(() => {
    const allDeadlines = deadlines;
    const avgLocked = Math.round(
      allDeadlines.reduce((s, d) => s + d.docsLocked, 0) / Math.max(allDeadlines.length, 1)
    );
    const totalRegistered = allDeadlines.reduce((s, d) => s + d.clientsRegistered, 0);
    const totalIssuesFixed = allDeadlines.reduce((s, d) => s + d.issuesFixed, 0);

    return { avgLocked, totalRegistered, totalIssuesFixed };
  }, [deadlines]);

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader
          title="Filing Deadlines"
          subtitle="Track GST filing deadlines and compliance status"
        />
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
          subtitle="Track GST filing deadlines and compliance status"
          action={
            <Button onClick={() => setFormOpen(!formOpen)} className="gap-2">
              <Calendar className="w-4 h-4" />
              Add Deadline
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Avg invoices confirmed"
              value={readyStats.avgLocked}
              color="#10b981"
            />
            <KpiCard
              label="Total Registered"
              value={readyStats.totalRegistered}
              color="#3b82f6"
            />
            <KpiCard
              label="Issues Fixed"
              value={readyStats.totalIssuesFixed}
              color="#8b5cf6"
            />
          </div>

          {/* Add Deadline Form */}
          {formOpen && (
            <Card className="p-6 bg-muted/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Add New Deadline</h3>
                <button
                  onClick={() => setFormOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddDeadline} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Filing Type
                  </label>
                  <select
                    value={formData.filingType}
                    onChange={(e) =>
                      setFormData({ ...formData, filingType: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="">Select filing type</option>
                    <option value="GSTR-1">GSTR-1 (Outward Supplies)</option>
                    <option value="GSTR-2B">GSTR-2B (Inward Supplies)</option>
                    <option value="GSTR-3B">GSTR-3B (Monthly Returns)</option>
                    <option value="GSTR-9">GSTR-9 (Annual Returns)</option>
                    <option value="ITC-04">ITC-04 (Input Credit)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? "Adding..." : "Add Deadline"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFormOpen(false);
                      setFormData({ filingType: "", dueDate: "" });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Deadlines List */}
          <div className="space-y-3">
            {deadlines.length === 0 ? (
              <Card className="p-12 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No deadlines yet. Add one to get started.</p>
              </Card>
            ) : (
              deadlines.map((deadline) => {
                const daysLeft = getDaysUntilDue(deadline.dueDate);
                const isReady =
                  deadline.docsLocked >= deadline.totalDocs * 0.9 &&
                  deadline.issuesFixed >= deadline.totalIssues * 0.95;

                return (
                  <Card
                    key={deadline.id}
                    className={`p-5 border-l-4 transition-all ${getStatusBg(deadline.status, daysLeft)}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 flex-1 min-w-0">
                        <div className="mt-0.5">
                          {getStatusIcon(deadline.status, daysLeft)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">
                              {deadline.filingType}
                            </h4>
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

                          {/* Checklist */}
                          <div className="mt-3 space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              <span className="text-muted-foreground">
                                {deadline.docsLocked} / {deadline.totalDocs} invoices confirmed
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              <span className="text-muted-foreground">
                                {deadline.clientsRegistered} / {deadline.totalClients} clients registered
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              <span className="text-muted-foreground">
                                {deadline.issuesFixed} / {deadline.totalIssues} issues fixed
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        {deadline.status !== "filed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkFiled(deadline.id)}
                            className="gap-1"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Filed
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogTitle>Delete Deadline</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this deadline? This action cannot be undone.
                            </AlertDialogDescription>
                            <div className="flex gap-2 justify-end">
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteDeadline(deadline.id)}
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
