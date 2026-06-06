import { useNavigate, useParams, useLocation } from "react-router";
import { useEffect, useRef } from "react";
import { useAppData } from "../context/AppDataContext";
import { usePreferences } from "../context/PreferencesContext";
import { useAppKeyboardShortcuts } from "../hooks/useAppKeyboardShortcuts";
import { Sidebar } from "../components/layout/Sidebar";
import { StatusBanner } from "../components/ui/StatusBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { Dashboard } from "../features/dashboard/Dashboard";
import { UploadScreen } from "../features/upload/UploadScreen";
import { RecordsScreen } from "../features/records/RecordsScreen";
import { ReviewScreen } from "../features/review/ReviewScreen";
import { ClientsScreen } from "../features/clients/ClientsScreen";
import { ClientDetailScreen } from "../features/clients/ClientDetailScreen";
import { GstRegistersScreen } from "../features/registers/GstRegistersScreen";
import { AuditLogScreen } from "../features/audit/AuditLogScreen";
// TIER 2 imports
import { FilingDeadlineScreen } from "../features/deadlines/FilingDeadlineScreen";
import { ITCReconciliationScreen } from "../features/reconciliation/ITCReconciliationScreen";
import { TaxLiabilityScreen } from "../features/tax-liability/TaxLiabilityScreen";
import { AmendmentWorkflowScreen } from "../features/amendments/AmendmentWorkflowScreen";
// TIER 3 imports
import { ZohoIntegrationScreen } from "../features/integrations/ZohoIntegrationScreen";
import { GstPortalIntegrationScreen } from "../features/integrations/GstPortalIntegrationScreen";
import { EmailForwardingScreen } from "../features/integrations/EmailForwardingScreen";
import { PreferencesScreen } from "../features/settings/PreferencesScreen";

export function AppShell() {
  const {
    docs,
    clients,
    partyByGstin,
    session,
    loading,
    error,
    refresh,
    patchDocument,
    lockDocument,
    bulkLockDocuments,
    rejectDocument,
    retryDocument,
    deleteDocument,
    bulkDeleteDocuments,
  } = useAppData();
  const { mode, setMode, isDark } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId, docId: routeDocId } = useParams();

  const screen = location.pathname.startsWith("/deadlines")
    ? "deadlines"
    : location.pathname.startsWith("/reconciliation")
      ? "reconciliation"
      : location.pathname.startsWith("/tax-liability")
        ? "tax_liability"
        : location.pathname.startsWith("/amendments")
          ? "amendments"
          : location.pathname.startsWith("/integrations/zoho")
            ? "zoho_integration"
            : location.pathname.startsWith("/integrations/gst-portal")
              ? "gst_portal_integration"
              : location.pathname.startsWith("/integrations/email")
                ? "email_forwarding"
                : location.pathname.startsWith("/upload")
                  ? "upload"
                  : location.pathname.startsWith("/records")
                    ? routeDocId
                      ? "review"
                      : "records"
                    : location.pathname.startsWith("/registers")
                      ? "registers"
                      : location.pathname.startsWith("/audit")
                        ? "audit"
                        : location.pathname.startsWith("/settings")
                          ? "settings"
                          : location.pathname.startsWith("/clients")
                          ? routeClientId
                            ? "client_detail"
                            : "clients"
                          : "dashboard";

  const reviewId = routeDocId ?? null;
  const selectedClientId = routeClientId ?? null;
  const pending = docs.filter((d) => d.stage === "ready_for_review").length;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  function openReview(id: string) {
    navigate(`/records/${id}`);
  }
  function openClient(id: string) {
    navigate(`/clients/${id}`);
  }
  function navTo(
    s:
      | "dashboard"
      | "upload"
      | "records"
      | "review"
      | "clients"
      | "client_detail"
      | "registers"
      | "audit"
      | "deadlines"
      | "reconciliation"
      | "tax_liability"
      | "amendments"
      | "zoho_integration"
      | "gst_portal_integration"
      | "email_forwarding"
      | "settings"
  ) {
    if (s === "dashboard") navigate("/");
    else if (s === "upload") navigate("/upload");
    else if (s === "records") navigate("/records");
    else if (s === "registers") navigate("/registers");
    else if (s === "audit") navigate("/audit");
    else if (s === "settings") navigate("/settings");
    else if (s === "clients") navigate("/clients");
    else if (s === "deadlines") navigate("/deadlines");
    else if (s === "reconciliation") navigate("/reconciliation");
    else if (s === "tax_liability") navigate("/tax-liability");
    else if (s === "amendments") navigate("/amendments");
    else if (s === "zoho_integration") navigate("/integrations/zoho");
    else if (s === "gst_portal_integration") navigate("/integrations/gst-portal");
    else if (s === "email_forwarding") navigate("/integrations/email");
  }

  useAppKeyboardShortcuts(navTo);

  const main =
    loading && docs.length === 0 && clients.length === 0 ? (
      <EmptyState title="Loading your practice data…" description="Fetching clients and documents from the server." />
    ) : error && docs.length === 0 && clients.length === 0 ? (
      <EmptyState
        title="Cannot reach the API"
        description={error}
        action={
          <button
            type="button"
            onClick={() => refresh()}
            className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg"
          >
            Retry connection
          </button>
        }
      />
    ) : (
      <>
        {screen === "dashboard" && (
          <Dashboard docs={docs} clients={clients} isDark={isDark} onNav={navTo} />
        )}
        {screen === "upload" && (
          <UploadScreen docs={docs} clients={clients} isDark={isDark} onReview={openReview} />
        )}
        {screen === "records" && (
          <RecordsScreen
            docs={docs}
            clients={clients}
            isDark={isDark}
            onReview={openReview}
            onDelete={deleteDocument}
          />
        )}
        {screen === "review" && reviewId && (
          docs.some((d) => d.id === reviewId) ? (
            <ReviewScreen
              docId={reviewId}
              docs={docs}
              isDark={isDark}
              onBack={() => navigate("/records")}
              partyByGstin={partyByGstin}
              onPatch={patchDocument}
              onLock={lockDocument}
              onReject={rejectDocument}
            />
          ) : (
            <EmptyState
              title="Document not found"
              description="This document was removed or the link is outdated."
              action={
                <button
                  type="button"
                  onClick={() => navigate("/records")}
                  className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg"
                >
                  Back to Records
                </button>
              }
            />
          )
        )}
        {screen === "clients" && (
          <ClientsScreen docs={docs} clients={clients} isDark={isDark} onClientClick={openClient} />
        )}
        {screen === "client_detail" && selectedClientId && (
          <ClientDetailScreen
            clientId={selectedClientId}
            docs={docs}
            clients={clients}
            isDark={isDark}
            onBack={() => navigate("/clients")}
            onReview={openReview}
            onRetry={retryDocument}
          />
        )}
        {screen === "registers" && (
          <GstRegistersScreen
            clients={clients}
            isDark={isDark}
            onReview={openReview}
          />
        )}
        {screen === "audit" && <AuditLogScreen />}
        {screen === "settings" && <PreferencesScreen />}
        {/* TIER 2 Screens */}
        {screen === "deadlines" && <FilingDeadlineScreen isDark={isDark} />}
        {screen === "reconciliation" && <ITCReconciliationScreen isDark={isDark} />}
        {screen === "tax_liability" && <TaxLiabilityScreen isDark={isDark} />}
        {screen === "amendments" && <AmendmentWorkflowScreen isDark={isDark} />}
        {/* TIER 3 Integration Screens */}
        {screen === "zoho_integration" && <ZohoIntegrationScreen isDark={isDark} />}
        {screen === "gst_portal_integration" && <GstPortalIntegrationScreen isDark={isDark} />}
        {screen === "email_forwarding" && <EmailForwardingScreen isDark={isDark} />}
      </>
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {error && !loading && (
        <StatusBanner variant="warning" message={error} onRetry={() => refresh()} />
      )}
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        <Sidebar
          screen={screen}
          onNav={navTo}
          pendingCount={pending}
          mode={mode}
          setMode={setMode}
          isDark={isDark}
          userName={session?.name ?? session?.email}
          userRole={session?.role ?? "operator"}
          onOpenSettings={() => navigate("/settings")}
        />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 min-h-0 flex flex-col overflow-hidden outline-none"
        >
          <div
            className={
              screen === "review"
                ? "flex-1 min-h-0 flex flex-col overflow-hidden"
                : "flex-1 overflow-y-auto max-w-[1440px] w-full mx-auto px-7 py-7"
            }
          >
            {main}
          </div>
        </main>
      </div>
    </div>
  );
}
