/**
 * GST compliance — manual return tracking (no external portal APIs).
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAppData } from "../../context/AppDataContext";
import { api, currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { Button } from "../../app/components/ui/button";
import { Card } from "../../app/components/ui/card";
import { Loader2, Calendar, History, CheckCircle2, ArrowRight } from "lucide-react";

type ReturnHistoryRow = Awaited<
  ReturnType<typeof api.gstPortal.returnsHistory>
>["returns"][number];

export function GstPortalIntegrationScreen({ isDark }: { isDark: boolean }) {
  const { clients } = useAppData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";

  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [returnHistory, setReturnHistory] = useState<ReturnHistoryRow[]>([]);
  const [selectedFy, setSelectedFy] = useState(currentFinancialYear());

  const FY_OPTIONS = listIndianFinancialYears(2016);
  const selectedClient = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (clientId) void loadReturnHistory();
    else {
      setReturnHistory([]);
      setLoading(false);
    }
  }, [clientId, selectedFy]);

  function selectClient(nextClientId: string) {
    const params = new URLSearchParams(searchParams);
    if (nextClientId) params.set("clientId", nextClientId);
    else params.delete("clientId");
    const q = params.toString();
    navigate({ pathname: "/integrations/gst-portal", search: q ? `?${q}` : "" }, { replace: true });
  }

  async function loadReturnHistory() {
    if (!clientId) return;
    try {
      setHistoryLoading(true);
      setLoading(true);
      const data = await api.gstPortal.returnsHistory(clientId, selectedFy);
      setReturnHistory(data.returns);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load return history");
    } finally {
      setHistoryLoading(false);
      setLoading(false);
    }
  }

  if (loading && clientId) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border">
        <PageHeader
          title="GST Compliance"
          subtitle="Manual return tracking — mark returns filed on Filing Deadlines"
          action={
            <Button onClick={() => navigate("/deadlines")} className="gap-2">
              <Calendar className="w-4 h-4" />
              Filing Deadlines
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card className="p-4 border-amber-200 bg-amber-50/80 dark:bg-amber-950/20">
          <p className="text-sm text-foreground">
            GST portal auto-sync is off. Seed deadlines from the compliance calendar, then use{" "}
            <strong>Mark filed</strong> when a return is submitted on the GST portal.
          </p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => selectClient(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gstin})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
              Financial year
            </label>
            <select
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
              disabled={!clientId}
            >
              {FY_OPTIONS.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!clientId ? (
          <Card className="p-12 text-center">
            <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Select a client to view manually tracked returns.</p>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <History className="w-5 h-5" />
                Returns marked filed
                {selectedClient ? ` — ${selectedClient.name}` : ""}
              </h3>
              <Button variant="outline" size="sm" onClick={() => navigate("/deadlines")} className="gap-1">
                Update on Filing Deadlines
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {historyLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading history…
              </div>
            ) : returnHistory.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  No returns marked filed for {selectedFy} yet.
                </p>
                <Button variant="outline" onClick={() => navigate("/deadlines")}>
                  Go to Filing Deadlines
                </Button>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Return</th>
                      <th className="text-left px-4 py-3 font-medium">Period</th>
                      <th className="text-left px-4 py-3 font-medium">Filed date</th>
                      <th className="text-left px-4 py-3 font-medium">ARN</th>
                      <th className="text-left px-4 py-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnHistory.map((row, i) => (
                      <tr key={`${row.returnType}-${row.period}-${i}`} className="border-t border-border">
                        <td className="px-4 py-3">{row.returnType}</td>
                        <td className="px-4 py-3">{row.period || "—"}</td>
                        <td className="px-4 py-3">{row.filedDate || "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.arn || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">Manual</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
