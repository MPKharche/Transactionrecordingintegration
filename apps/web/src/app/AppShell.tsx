import { useNavigate, useParams, useLocation } from "react-router";
import { useEffect } from "react";
import { useAppData } from "../context/AppDataContext";
import { useTheme } from "../hooks/useTheme";
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
  } = useAppData();
  const { mode, setMode, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId: routeClientId, docId: routeDocId } = useParams();

  const screen = location.pathname.startsWith("/upload")
    ? "upload"
    : location.pathname.startsWith("/records")
      ? routeDocId
        ? "review"
        : "records"
      : location.pathname.startsWith("/registers")
        ? "registers"
        : location.pathname.startsWith("/audit")
          ? "audit"
          : location.pathname.startsWith("/clients")
            ? routeClientId
              ? "client_detail"
              : "clients"
            : "dashboard";

  const reviewId = routeDocId ?? null;
  const selectedClientId = routeClientId ?? null;
  const pending = docs.filter((d) => d.stage === "ready_for_review").length;

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
  ) {
    if (s === "dashboard") navigate("/");
    else if (s === "upload") navigate("/upload");
    else if (s === "records") navigate("/records");
    else if (s === "registers") navigate("/registers");
    else if (s === "audit") navigate("/audit");
    else if (s === "clients") navigate("/clients");
  }

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
            onRetry={retryDocument}
            onBulkLock={bulkLockDocuments}
          />
        )}
        {screen === "review" && reviewId && (
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
          <GstRegistersScreen clients={clients} isDark={isDark} />
        )}
        {screen === "audit" && <AuditLogScreen />}
      </>
    );

  return (
    <div
      className={isDark ? "dark" : ""}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        colorScheme: isDark ? "dark" : "light",
      }}
    >
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
        />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
