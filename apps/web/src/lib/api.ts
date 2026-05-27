import type { AuditLogEntry, Client, GSTDocument, GstRegisterRow, Party, UserRole } from "@ca-suite/shared";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type AuthHeaders = {
  tenantId: string;
  userId: string;
  email?: string;
  name?: string;
  role?: UserRole;
};

let auth: AuthHeaders | null = null;

export function setAuth(a: AuthHeaders) {
  auth = a;
}

export function getAuth() {
  return auth;
}

function headers(json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...headers(), ...init?.headers },
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

/** Returns null when not signed in (401). Does not log to console on expected 401. */
export async function trySession(): Promise<AuthHeaders | null> {
  const res = await fetch(`${BASE}/auth/session`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const d = (await res.json()) as {
    tenantId: string;
    userId: string;
    email: string;
    name?: string;
    role?: UserRole;
  };
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

export const api = {
  session: async () => {
    const s = await trySession();
    if (!s) throw new Error("Not signed in");
    return s;
  },
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" }),
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
  },
  parties: {
    list: () => request<Record<string, Party>>("/parties"),
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
    previewUrl: (id: string) =>
      request<{ url: string }>(`/documents/${id}/preview-url`),
    upload: async (file: File, clientId: string, docType: string, fy?: string) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", clientId);
      fd.append("doc_type", docType);
      fd.append("financial_year", fy ?? currentFinancialYear());
      const res = await fetch(`${BASE}/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const b = body as { error?: string; existingId?: string };
        if (b.existingId) {
          const err = new Error(b.error ?? "Duplicate document") as Error & {
            existingId?: string;
          };
          err.existingId = b.existingId;
          throw err;
        }
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<GSTDocument>;
    },
  },
  registers: {
    list: (kind: "sales" | "purchase", params?: { client_id?: string; financial_year?: string }) => {
      const q = new URLSearchParams({ ...(params as Record<string, string>) });
      const qs = q.toString();
      return request<GstRegisterRow[]>(`/registers/${kind}${qs ? `?${qs}` : ""}`);
    },
  },
  export: {
    zoho: async (
      type: "sales" | "purchase",
      params?: { client_id?: string; financial_year?: string }
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
};

export { currentIndianFinancialYear as currentFinancialYear } from "@ca-suite/shared";
