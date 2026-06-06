import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { Client, GSTDocument, MastersBundle, Party } from "@ca-suite/shared";
import { api, getAuth, trySession, type AuthHeaders } from "../lib/api";

type Ctx = {
  docs: GSTDocument[];
  clients: Client[];
  partyByGstin: Record<string, Party>;
  masters: MastersBundle;
  session: AuthHeaders | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshMasters: () => Promise<void>;
  upsertParty: (party: Party) => Promise<void>;
  createClient: (body: Partial<Client>) => Promise<Client>;
  patchClient: (id: string, patch: Partial<Client>) => Promise<void>;
  patchDocument: (id: string, patch: Partial<GSTDocument>) => Promise<void>;
  lockDocument: (id: string) => Promise<void>;
  bulkLockDocuments: (
    ids: string[]
  ) => Promise<{ locked: string[]; errors: { id: string; errors: string[] }[] }>;
  rejectDocument: (id: string, reason?: string) => Promise<void>;
  retryDocument: (id: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  bulkDeleteDocuments: (
    ids: string[]
  ) => Promise<{ deleted: string[]; errors: { id: string; error: string }[] }>;
  uploadFile: (
    file: File,
    clientId: string,
    docType: string,
    fy?: string
  ) => Promise<GSTDocument>;
};

const AppDataContext = createContext<Ctx | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<GSTDocument[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [partyByGstin, setPartyByGstin] = useState<Record<string, Party>>({});
  const [masters, setMasters] = useState<MastersBundle>({ hsn: [], units: [], items: [] });
  const [session, setSession] = useState<AuthHeaders | null>(getAuth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const docsRef = useRef<GSTDocument[]>([]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const s = await trySession();
      setSession(s);
      if (!s) {
        setClients([]);
        setDocs([]);
        setPartyByGstin({});
      setMasters({ hsn: [], units: [], items: [] });
        return;
      }
      const [c, d, parties, m] = await Promise.all([
        api.clients.list(),
        api.documents.list(),
        api.parties.list(),
        api.masters.list().catch(() => ({ hsn: [], units: [], items: [] })),
      ]);
      setClients(c);
      setDocs(d);
      setPartyByGstin(parties);
      setMasters(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data from API");
      setClients([]);
      setDocs([]);
      setPartyByGstin({});
      setMasters({ hsn: [], units: [], items: [] });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    document.addEventListener("visibilitychange", onVis);

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const processing = docsRef.current.some((d) =>
        ["stored", "ocr", "split", "extracting"].includes(d.stage)
      );
      const ms = document.hidden ? 60_000 : processing ? 8_000 : 30_000;
      timer = setTimeout(async () => {
        await refresh(true);
        schedule();
      }, ms);
    };
    schedule();

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const createClient = useCallback(async (body: Partial<Client>) => {
    const created = await api.clients.create(body);
    setClients((prev) => {
      const without = prev.filter((c) => c.id !== created.id);
      return [...without, created].sort((a, b) => a.name.localeCompare(b.name));
    });
    return created;
  }, []);

  const patchClient = useCallback(async (id: string, patch: Partial<Client>) => {
    const updated = await api.clients.patch(id, patch);
    setClients((prev) =>
      prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
    );
  }, []);

  const refreshMasters = useCallback(async () => {
    try {
      setMasters(await api.masters.list());
    } catch {
      /* ignore */
    }
  }, []);

  const upsertParty = useCallback(async (party: Party) => {
    if (!party.gstin) return;
    await api.parties.upsert(party);
    setPartyByGstin((prev) => ({
      ...prev,
      [party.gstin.toUpperCase()]: { ...party, gstin: party.gstin.toUpperCase() },
    }));
  }, []);

  const patchDocument = useCallback(async (id: string, patch: Partial<GSTDocument>) => {
    const updated = await api.documents.patch(id, patch);
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    await refreshMasters();
  }, [refreshMasters]);

  const lockDocument = useCallback(async (id: string) => {
    const updated = await api.documents.lock(id);
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    const parties = await api.parties.list();
    setPartyByGstin(parties);
    await refreshMasters();
    toast.success("Invoice confirmed and added to Records");
  }, [refreshMasters]);

  const bulkLockDocuments = useCallback(async (ids: string[]) => {
    const res = await api.documents.bulkLock(ids);
    const lockedSet = new Set(res.locked);
    setDocs((prev) =>
      prev.map((d) =>
        lockedSet.has(d.id)
          ? { ...d, stage: "locked" as const, recorded_at: new Date().toISOString().slice(0, 10) }
          : d
      )
    );
    if (res.locked.length > 0) {
      const parties = await api.parties.list();
      setPartyByGstin(parties);
      await refreshMasters();
      toast.success(`${res.locked.length} invoice${res.locked.length !== 1 ? "s" : ""} confirmed`);
    }
    if (res.errors.length > 0) {
      toast.error(`${res.errors.length} invoice${res.errors.length !== 1 ? "s" : ""} could not be confirmed`);
    }
    return res;
  }, [refreshMasters]);

  const rejectDocument = useCallback(async (id: string, reason?: string) => {
    const updated = await api.documents.reject(id, reason);
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    toast.success("Document rejected");
  }, []);

  const retryDocument = useCallback(async (id: string) => {
    const updated = await api.documents.retry(id);
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    toast.success("Document queued for retry");
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    try {
      await api.documents.delete(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document archived");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Archive failed");
      throw e;
    }
  }, []);

  const bulkDeleteDocuments = useCallback(async (ids: string[]) => {
    const res = await api.documents.bulkDelete(ids);
    const deletedSet = new Set(res.deleted);
    setDocs((prev) => prev.filter((d) => !deletedSet.has(d.id)));
    return res;
  }, []);

  const uploadFile = useCallback(
    async (file: File, clientId: string, docType: string, fy?: string) => {
      const created = await api.documents.upload(file, clientId, docType, fy);
      setDocs((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const value = useMemo(
    () => ({
      docs,
      clients,
      partyByGstin,
      masters,
      session,
      loading,
      error,
      refresh,
      refreshMasters,
      upsertParty,
      createClient,
      patchClient,
      patchDocument,
      lockDocument,
      bulkLockDocuments,
      rejectDocument,
      retryDocument,
      deleteDocument,
      bulkDeleteDocuments,
      uploadFile,
    }),
    [
      docs,
      clients,
      partyByGstin,
      masters,
      session,
      loading,
      error,
      refresh,
      refreshMasters,
      upsertParty,
      createClient,
      patchClient,
      patchDocument,
      lockDocument,
      bulkLockDocuments,
      rejectDocument,
      retryDocument,
      deleteDocument,
      bulkDeleteDocuments,
      uploadFile,
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData outside provider");
  return ctx;
}
