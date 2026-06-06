import { useEffect, useState } from "react";
import { Badge } from "../../app/components/ui/badge";
import { Button } from "../../app/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../app/components/ui/tooltip";
import { Loader2, RefreshCw } from "lucide-react";

export type ZohoSyncStatus =
  | "not_configured"
  | "pending"
  | "syncing"
  | "synced"
  | "error"
  | "skipped";

interface ZohoSyncBadgeProps {
  docId?: string;
  clientId?: string;
  status?: ZohoSyncStatus | string | null;
  entityId?: string | null;
  error?: { message?: string } | null;
  syncedAt?: string | null;
  onRetry?: () => void;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function ZohoSyncBadge({
  status = "not_configured",
  entityId,
  error,
  syncedAt,
  onRetry,
}: ZohoSyncBadgeProps) {
  const s = (status ?? "not_configured") as ZohoSyncStatus;

  if (s === "not_configured") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Zoho
      </Badge>
    );
  }

  if (s === "pending" || s === "syncing") {
    return (
      <Badge className="bg-blue-600 animate-pulse gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing to Zoho…
      </Badge>
    );
  }

  if (s === "synced") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-green-600">Synced</Badge>
          </TooltipTrigger>
          <TooltipContent>
            Synced {relativeTime(syncedAt)} · {entityId ?? "—"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (s === "error") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1">
              Zoho error
              {onRetry && (
                <Button size="sm" variant="ghost" className="h-5 px-1" onClick={onRetry}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{error?.message ?? "Sync failed"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary">Skipped</Badge>
        </TooltipTrigger>
        <TooltipContent>Pre-connection document</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function useZohoStatusPoll(clientId?: string, intervalMs = 30000) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/integrations/zoho/status/${clientId}`, { credentials: "include" });
        if (res.ok && !cancelled) setStatus(await res.json());
      } catch {
        /* ignore */
      }
    }
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [clientId, intervalMs]);
  return status;
}
