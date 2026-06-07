import { useNavigate, useParams, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { usePreferences } from "../context/PreferencesContext";
import { useAppKeyboardShortcuts } from "../hooks/useAppKeyboardShortcuts";
import { Sidebar } from "../components/layout/Sidebar";
import { StatusBanner } from "../components/ui/StatusBanner";
import { EmptyState } from "../components/ui/EmptyState";
import { Dashboard } from "../features/dashboard/Dashboard";
import { UploadScreen } from "../features/upload/UploadScreen";
import { RecordsScreen } from "../features/records/RecordsScreen";
import { DocumentWorkspace } from "../components/documents/DocumentWorkspace";
import { ClientsScreen } from "../features/clients/ClientsScreen";
import { ClientDetailScreen } from "../features/clients/ClientDetailScreen";
import { BillingScreenBeautiful } from "../features/billing/BillingScreenBeautiful";
// Archived features - moved to _archive/features/
import { GstRegistersScreen } from "../features/registers/GstRegistersScreen";
// import { AuditLogScreen } from "../features/audit/AuditLogScreen";
// import { FilingDeadlineScreen } from "../features/deadlines/FilingDeadlineScreen";
// import { ITCReconciliationScreen } from "../features/reconciliation/ITCReconciliationScreen";
// import { TaxLiabilityScreen } from "../features/tax-liability/TaxLiabilityScreen";
// import { AmendmentWorkflowScreen } from "../features/amendments/AmendmentWorkflowScreen";
// TIER 3 imports
import { ZohoIntegrationScreen } from "../features/integrations/ZohoIntegrationScreen";
import { GstPortalIntegrationScreen } from "../features/integrations/GstPortalIntegrationScreen";
import { EmailForwardingScreen } from "../features/integrations/EmailForwardingScreen";
import { AdminObserveScreen } from "../features/admin/AdminObserveScreen";
import { PreferencesScreen } from "../features/settings/PreferencesScreen";
import { WorkflowGuide } from "../features/guide/WorkflowGuide";

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
  const [guideOpen, setGuideOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId, docId: routeDocId } = useParams();

  const screen = location.pathname.startsWith("/billing")
            ? "billing"
            : location.pathname.startsWith("/integrations/zoho")
            ? "zoho_integration"
            : location.pathname.startsWith("/integrations/gst-portal")
              ? "gst_portal_integration"
              : location.pathname.startsWith("/integrations/email")
                ? "email_forwarding"
                : location.pathname.startsWith("/upload")
                  ? "upload"
                  : location.pathname.startsWith("/records")
                    ? "records"
                    : location.pathname.startsWith("/admin/observe")
                      ? "observe"
                      : location.pathname.startsWith("/settings")
                      ? "settings"
                      : location.pathname.startsWith("/clients")
                      ? routeClientId
                        ? "client_detail"
                        : "clients"
                      : "dashboard";

  const reviewId =
    routeDocId ?? new URLSearchParams(location.search).get("doc") ?? null;
  const selectedClientId = routeClientId ?? null;
  const pending = docs.filter((d) => d.stage === "ready_for_review").length;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  function openReview(id: string) {
    if (location.pathname.startsWith("/records")) {
      navigate(`/records/${id}`);
    } else {
      const params = new URLSearchParams(location.search);
      params.set("doc", id);
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" });
    }
  }

  function closeReview() {
    if (routeDocId) {
      navigate("/records");
      return;
    }
    const params = new URLSearchParams(location.search);
    params.delete("doc");
    const q = params.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : "" });
  }
  function openClient(id: string) {
    navigate(`/clients/${id}`);
  }
  function navTo(
    s:
      | "dashboard"
      | "upload"
      | "billing"
      | "records"
      | "review"
      | "clients"
      | "client_detail"
      | "registers"
      | "audit"
      | "observe"
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
    else if (s === "billing") navigate("/billing");
    else if (s === "records") navigate("/records");
    else if (s === "registers") navigate("/registers");
    else if (s === "audit") navigate("/audit");
    else if (s === "observe") navigate("/admin/observe");
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
          <UploadScreen
            docs={docs}
            clients={clients}
            isDark={isDark}
            onReview={openReview}
            isAdmin={session?.role === "admin"}
            onDelete={deleteDocument}
            retryDocument={retryDocument}
          />
        )}
        {screen === "billing" && (
          <BillingScreenBeautiful
            clients={clients}
            documents={docs}
            onClose={() => navigate("/upload")}
            onSuccess={() => refresh()}
          />
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
        {screen === "observe" && <AdminObserveScreen isDark={isDark} />}
        {screen === "settings" && <PreferencesScreen />}
        {screen === "registers" && (
          <GstRegistersScreen
            clients={clients}
            isDark={isDark}
            onReview={openReview}
          />
        )}
        {/* Archived features - commented out, moved to _archive/features/
        {screen === "audit" && <AuditLogScreen />}
        {screen === "deadlines" && <FilingDeadlineScreen isDark={isDark} />}
        {screen === "reconciliation" && <ITCReconciliationScreen isDark={isDark} />}
        {screen === "tax_liability" && <TaxLiabilityScreen isDark={isDark} />}
        {screen === "amendments" && <AmendmentWorkflowScreen isDark={isDark} />}
        */}
        {/* Integration Screens */}
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
          onOpenGuide={() => setGuideOpen(true)}
        />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 min-h-0 flex flex-col overflow-hidden outline-none"
        >
          <div className="flex-1 overflow-y-auto max-w-[1440px] w-full mx-auto px-7 py-7">
            {main}
          </div>
        </main>
      </div>
      {guideOpen && <WorkflowGuide onClose={() => setGuideOpen(false)} />}
      {reviewId && (() => {
        const reviewDoc = docs.find((d) => d.id === reviewId);
        if (!reviewDoc) return null;
        const reviewClient = clients.find((c) => c.id === reviewDoc.client_id);
        return (
          <DocumentWorkspace
            doc={reviewDoc}
            docs={docs}
            client={reviewClient}
            isDark={isDark}
            isAdmin={session?.role === "admin"}
            partyByGstin={partyByGstin}
            onClose={closeReview}
            onPatch={patchDocument}
            onLock={lockDocument}
            onReject={rejectDocument}
          />
        );
      })()}
    </div>
  );
}
