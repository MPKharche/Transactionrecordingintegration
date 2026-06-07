import type { AuditLogEntry, Client, GSTDocument, GstRegisterRow, MastersBundle, Party, UserRole, RegisterKind, UserPreferences } from "@ca-suite/shared";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  preferences: UserPreferences;
  authProvider: "google" | "dev" | "password";
};

export type AuthHeaders = {
  tenantId: string;
  userId: string;
  email?: string;
  name?: string;
  role?: UserRole;
};

export type AdminObserveSnapshot = {
  budget_day: string;
  daily_budget_usd: number;
  spent_today_usd: number;
  remaining_today_usd: number;
  can_spend: boolean;
  deferred_count: number;
  deferred_uploads: {
    id: string;
    filename: string;
    current_stage: string | null;
    resume_stage: string | null;
    created_at: string;
  }[];
  recent_usage: {
    id: string;
    document_id: string | null;
    filename: string | null;
    upload_id: string | null;
    stage: string;
    model: string;
    cost_usd: number;
    created_at: string;
  }[];
};

let auth: AuthHeaders | null = null;

export function setAuth(a: AuthHeaders) {
  auth = a;
}

export function getAuth() {
  return auth;
}

function requestHeaders(init?: RequestInit): HeadersInit {
  const h: Record<string, string> = {};
  const hasBody = init?.body != null && init.body !== "";
  if (hasBody) h["Content-Type"] = "application/json";
  return h;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...requestHeaders(init), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const b = body as { error?: string; errors?: string[]; existingId?: string };
    if (b.errors?.length) throw new Error(b.errors.join("; "));
    if (b.existingId) throw new Error(`${b.error ?? "Duplicate"} (${b.existingId})`);
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Returns null when not signed in. Uses 200 + signedIn:false (no console 401 noise). */
export async function trySession(): Promise<AuthHeaders | null> {
  const res = await fetch(`${BASE}/auth/session`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const d = (await res.json()) as {
    signedIn?: boolean;
    tenantId?: string;
    userId?: string;
    email?: string;
    name?: string;
    role?: UserRole;
  };
  if (d.signedIn === false || !d.tenantId || !d.userId) return null;
  auth = {
    tenantId: d.tenantId,
    userId: d.userId,
    email: d.email,
    name: d.name,
    role: d.role,
  };
  return auth;
}

export async function devLogin(): Promise<AuthHeaders> {
  const data = await request<{ tenantId: string; userId: string; email: string }>(
    "/auth/dev-login",
    { method: "POST", body: JSON.stringify({}) }
  );
  auth = { tenantId: data.tenantId, userId: data.userId, email: data.email };
  return auth;
}

export async function passwordLogin(email: string, password: string): Promise<AuthHeaders> {
  const data = await request<{
    tenantId: string;
    userId: string;
    email: string;
    role?: UserRole;
  }>("/auth/password-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  auth = {
    tenantId: data.tenantId,
    userId: data.userId,
    email: data.email,
    role: data.role,
  };
  return auth;
}

export const api = {
  session: async () => {
    const s = await trySession();
    if (!s) throw new Error("Not signed in");
    return s;
  },
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" }),
  users: {
    me: () => request<UserProfile>("/users/me"),
    updatePreferences: (preferences: UserPreferences) =>
      request<{ preferences: UserPreferences }>("/users/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(preferences),
      }),
  },
  health: () => request<{ ok: boolean }>("/health"),
  clients: {
    list: () => request<Client[]>("/clients"),
    create: (body: Partial<Client>) =>
      request<Client>("/clients", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Client>) =>
      request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    setAssignments: (id: string, userIds: string[]) =>
      request<{ user_ids: string[] }>(`/clients/${id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({ user_ids: userIds }),
      }),
    hsn: {
      list: (clientId: string) =>
        request<{ hsn: { code: string; description: string; default_gst_rate?: number; use_count: number; is_client_specific?: boolean }[] }>(
          `/clients/${clientId}/masters/hsn`
        ),
      upsert: (clientId: string, body: { code: string; description?: string; default_gst_rate?: number }) =>
        request<{ code: string; description: string; default_gst_rate?: number; use_count: number }>(
          `/clients/${clientId}/masters/hsn`,
          { method: "POST", body: JSON.stringify(body) }
        ),
      remove: (clientId: string, code: string) =>
        request<{ ok: boolean }>(`/clients/${clientId}/masters/hsn/${encodeURIComponent(code)}`, {
          method: "DELETE",
        }),
    },
  },
  parties: {
    list: () => request<Record<string, Party>>("/parties"),
    upsert: (party: Party) =>
      request<Party>("/parties", { method: "POST", body: JSON.stringify(party) }),
  },
  masters: {
    list: () => request<MastersBundle>("/masters"),
    upsertHsn: (body: { code: string; description?: string; default_gst_rate?: number }) =>
      request("/masters/hsn", { method: "POST", body: JSON.stringify(body) }),
    upsertUnit: (body: { code: string; label?: string }) =>
      request("/masters/units", { method: "POST", body: JSON.stringify(body) }),
    upsertItem: (body: { description: string; hsn_code?: string; unit_code?: string }) =>
      request("/masters/items", { method: "POST", body: JSON.stringify(body) }),
  },
  documents: {
    list: (params?: {
      client_id?: string;
      stage?: string;
      financial_year?: string;
      assigned_to?: string;
      limit?: string;
      offset?: string;
    }) => {
      const q = new URLSearchParams(params as Record<string, string>);
      const qs = q.toString();
      return request<GSTDocument[]>(`/documents${qs ? `?${qs}` : ""}`);
    },
    bulkLock: (ids: string[]) =>
      request<{ locked: string[]; errors: { id: string; errors: string[] }[] }>(
        "/documents/bulk-lock",
        { method: "POST", body: JSON.stringify({ ids }) }
      ),
    get: (id: string) => request<GSTDocument>(`/documents/${id}`),
    patch: (id: string, body: Partial<GSTDocument>) =>
      request<GSTDocument>(`/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    lock: (id: string) =>
      request<GSTDocument>(`/documents/${id}/lock`, { method: "POST", body: "{}" }),
    retry: (id: string) =>
      request<GSTDocument>(`/documents/${id}/retry`, { method: "POST", body: "{}" }),
    reject: (id: string, reason?: string) =>
      request<GSTDocument>(`/documents/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean; id: string }>(`/documents/${id}`, { method: "DELETE" }),
    bulkDelete: (ids: string[]) =>
      request<{ deleted: string[]; errors: { id: string; error: string }[] }>(
        "/documents/bulk-delete",
        { method: "POST", body: JSON.stringify({ ids }) }
      ),
    previewUrl: (id: string) =>
      request<{ url: string }>(`/documents/${id}/preview-url`),
    upload: async (file: File, clientId: string, docType: string, fy?: string) => {
      const fd = new FormData();
      fd.append("client_id", clientId);
      fd.append("doc_type", docType);
      fd.append("financial_year", fy ?? currentFinancialYear());
      fd.append("file", file);

      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(`${BASE}/documents/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (res.ok) return res.json() as Promise<GSTDocument>;

        const body = await res.json().catch(() => ({}));
        const b = body as {
          error?: string;
          existingId?: string;
          existingStage?: string;
          retryAfterSec?: number;
        };

        if (b.existingId) {
          const err = new Error(b.error ?? "Duplicate document") as Error & {
            existingId?: string;
            existingStage?: string;
          };
          err.existingId = b.existingId;
          err.existingStage = b.existingStage;
          throw err;
        }

        if (res.status === 503 && attempt < maxAttempts - 1) {
          const waitSec = b.retryAfterSec ?? 8 + attempt * 4;
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      throw new Error("Upload failed after retries");
    },
    pipelineStatus: () =>
      request<{
        depth: number;
        maxDepth: number;
        acceptingUploads: boolean;
        waiting: number;
        active: number;
      }>("/pipeline/status"),
    createManual: async (fields: Record<string, string>, attachment?: File) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined && v !== null) fd.append(k, v);
      }
      if (attachment) fd.append("file", attachment);
      const res = await fetch(`${BASE}/documents/manual`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<GSTDocument>;
    },
  },
  registers: {
    list: (kind: RegisterKind, params?: { client_id?: string; financial_year?: string }) => {
      const q = new URLSearchParams({ ...(params as Record<string, string>) });
      const qs = q.toString();
      return request<GstRegisterRow[]>(`/registers/${kind}${qs ? `?${qs}` : ""}`);
    },
  },
  export: {
    zoho: async (
      type: "sales" | "purchase",
      params?: { client_id?: string; financial_year?: string; register_kind?: RegisterKind }
    ) => {
      const q = new URLSearchParams({ type, ...(params as Record<string, string>) });
      const res = await fetch(`${BASE}/export/zoho?${q}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zoho_${type}_${params?.financial_year ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  auditLog: {
    list: () => request<AuditLogEntry[]>("/audit-log"),
  },
  compliance: {
    calendar: () =>
      request<{ month: string; reminders: { return_type: string; due_day: number; note: string }[] }>(
        "/compliance/calendar"
      ),
  },
  filingDeadlines: {
    list: (opts?: { financialYear?: string; clientId?: string }) => {
      const params = new URLSearchParams();
      if (opts?.financialYear) params.set("financial_year", opts.financialYear);
      if (opts?.clientId) params.set("client_id", opts.clientId);
      const q = params.toString();
      return request<{
        financialYear: string;
        deadlines: Array<{
          id: string;
          clientId: string;
          clientName: string;
          clientGstin: string;
          financialYear: string;
          filingType: "GSTR1" | "GSTR2B" | "GSTR3B";
          filingTypeLabel: string;
          dueDate: string;
          status: "pending" | "filed" | "overdue";
          filedDate: string | null;
          notes: string | null;
          daysUntilDue: number;
          isOverdue: boolean;
        }>;
        readiness: {
          docsLocked: number;
          totalDocs: number;
          issuesFixed: number;
          totalIssues: number;
          clientsRegistered: number;
          totalClients: number;
        };
      }>(`/filing-deadlines${q ? `?${q}` : ""}`);
    },
    listForClient: (clientId: string, financialYear?: string) => {
      const q = financialYear ? `?financial_year=${encodeURIComponent(financialYear)}` : "";
      return request<{ deadlines: Array<Record<string, unknown>> }>(
        `/filing-deadlines/${encodeURIComponent(clientId)}${q}`
      );
    },
    create: (
      clientId: string,
      body: {
        financial_year: string;
        filing_type: "GSTR1" | "GSTR2B" | "GSTR3B";
        due_date: string;
        notes?: string;
      }
    ) =>
      request<Record<string, unknown>>(`/filing-deadlines/${encodeURIComponent(clientId)}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    seed: (clientId: string, financialYear?: string) => {
      const q = financialYear ? `?financial_year=${encodeURIComponent(financialYear)}` : "";
      return request<{ ok: boolean; created: number }>(
        `/filing-deadlines/${encodeURIComponent(clientId)}/seed${q}`,
        { method: "POST" }
      );
    },
    patch: (id: string, body: { status?: "pending" | "filed" | "overdue"; notes?: string }) =>
      request<Record<string, unknown>>(`/filing-deadlines/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/filing-deadlines/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  gstPortal: {
    status: (clientId: string, fy?: string) => {
      const q = fy ? `?fy=${encodeURIComponent(fy)}` : "";
      return request<{
        connected: boolean;
        configId?: string;
        gstin?: string;
        gstnUsername?: string;
        clientGstin?: string;
        clientName?: string;
        lastSyncAt?: string;
        lastGstr1FetchAt?: string;
        lastGstr2bFetchAt?: string;
        syncStatus?: string;
        gstr1Status?: "filed" | "pending";
        gstr2bStatus?: "filed" | "pending";
        gstr3bStatus?: "filed" | "pending";
        gspConfigured: boolean;
        reconciliationStatus?: "synced" | "mismatched" | "unknown";
        mismatches?: number;
        tokenExpiresAt?: string;
        error?: string;
      }>(`/integrations/gst-portal/status/${encodeURIComponent(clientId)}${q}`);
    },
    requestOtp: (clientId: string, username: string) =>
      request<{ success: boolean; message: string }>(
        `/integrations/gst-portal/otp/request/${encodeURIComponent(clientId)}`,
        { method: "POST", body: JSON.stringify({ username }) }
      ),
    verifyOtp: (clientId: string, username: string, otp: string) =>
      request<{
        success: boolean;
        config_id: string;
        token_expires_at?: string;
        returns_filed: Array<{
          returnType: string;
          period: string;
          status: string;
          filedDate: string;
          arn?: string;
          filingType?: string;
        }>;
      }>(`/integrations/gst-portal/otp/verify/${encodeURIComponent(clientId)}`, {
        method: "POST",
        body: JSON.stringify({ username, otp }),
      }),
    returnsHistory: (clientId: string, fy?: string) => {
      const q = fy ? `?fy=${encodeURIComponent(fy)}` : "";
      return request<{
        success: boolean;
        financialYear: string;
        returns: Array<{
          returnType: string;
          period: string;
          status: string;
          filedDate: string;
          arn?: string;
          mode?: string;
          filingType?: string;
        }>;
        error?: string;
      }>(`/integrations/gst-portal/returns-history/${encodeURIComponent(clientId)}${q}`);
    },
    syncStatus: (clientId: string, fy?: string) => {
      const q = fy ? `?fy=${encodeURIComponent(fy)}` : "";
      return request<Record<string, unknown>>(
        `/integrations/gst-portal/sync-status/${encodeURIComponent(clientId)}${q}`,
        { method: "POST" }
      );
    },
    connect: (
      clientId: string,
      body: { portal_token: string; refresh_token?: string; gstn_username?: string }
    ) =>
      request<{ success: boolean; config_id: string }>(
        `/integrations/gst-portal/connect/${encodeURIComponent(clientId)}`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    disconnect: (clientId: string) =>
      request<{ success: boolean }>(
        `/integrations/gst-portal/disconnect/${encodeURIComponent(clientId)}`,
        { method: "DELETE" }
      ),
    fetchGstr: (clientId: string, type: "gstr1" | "gstr2b", fy: string) =>
      request<{
        success: boolean;
        data: Record<string, unknown>;
        mismatches: Array<{ docNumber: string; message: string }>;
      }>(
        `/integrations/gst-portal/gstr/${encodeURIComponent(clientId)}?type=${type}&fy=${encodeURIComponent(fy)}`
      ),
  },
  versions: {
    list: (docId: string) =>
      request<
        {
          id: string;
          versionNo: number;
          changeSummary: string | null;
          changedBy: string;
          changedAt: string;
          modificationChannel: string;
          captureSource?: string;
          capturedAt?: string;
          uploadedBy?: string;
          changes: { field: string; label: string; before: string; after: string }[];
        }[]
      >(`/documents/${docId}/versions`),
    load: (docId: string, versionId: string) =>
      request<
        | GSTDocument
        | {
            snapshot: GSTDocument;
            versionNo: number;
            changedBy: string;
            changedAt: string;
            changeSummary: string | null;
            captureSource?: string;
          }
      >(`/documents/${docId}/versions/${versionId}`),
    save: (
      docId: string,
      doc: Partial<GSTDocument> & { changeSummary?: string }
    ) =>
      request<{ doc: GSTDocument; versionNo: number }>(
        `/documents/${docId}/versions`,
        { method: "POST", body: JSON.stringify(doc) }
      ),
    restore: (docId: string, versionId: string, changeSummary?: string) =>
      request<{ ok: boolean; versionNo: number }>(
        `/documents/${docId}/versions/${versionId}/restore`,
        { method: "POST", body: JSON.stringify({ changeSummary }) }
      ),
  },
  gstin: {
    lookup: (gstin: string) =>
      request<{
        gstin: string;
        legalName: string;
        tradeName: string;
        status: string;
        registrationDate: string;
        stateCode: string;
        state: string;
        address: string;
        city: string;
        pincode: string;
        pan: string;
        constitutionOfBusiness: string;
        natureOfBusiness: string[];
        hsnCodes: string[];
        sacCodes: string[];
        source: "cache" | "master" | "portal" | "api" | "derived";
        portalAvailable?: boolean;
      }>(`/gstin/lookup/${encodeURIComponent(gstin)}`),
  },
  authConfig: () =>
    request<{
      googleEnabled: boolean;
      devLoginEnabled: boolean;
      passwordLoginEnabled?: boolean;
      accessRestricted?: boolean;
    }>("/auth/config"),
  admin: {
    observe: {
      get: () => request<AdminObserveSnapshot>("/admin/observe"),
      setBudget: (daily_budget_usd: number) =>
        request<AdminObserveSnapshot>("/admin/observe", {
          method: "PATCH",
          body: JSON.stringify({ daily_budget_usd }),
        }),
    },
  },
};

export { currentIndianFinancialYear as currentFinancialYear, listIndianFinancialYears } from "@ca-suite/shared";
