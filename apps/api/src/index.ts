import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  assertPipelineCapacity,
  enqueuePipelineJob,
  getPipelineQueueMetrics,
} from "./lib/pipeline-queue.js";
import { MAX_UPLOAD_BYTES } from "@ca-suite/shared/server";
import { eq, and, desc, inArray, max, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@ca-suite/db/client";
import {
  auditLog,
  clientAssignments,
  clients,
  documentIssues,
  documentLines,
  documentVersions,
  gstDocuments,
  partyMaster,
  uploads,
  tenants,
  users,
  memberships,
} from "@ca-suite/db";
import {
  canLockDocument,
  isBlockingDuplicateStage,
  isValidGSTIN,
  isValidPAN,
  validateGstDocument,
  computeDocumentCompleteness,
  currentIndianFinancialYear,
  financialYearFromIsoDate,
  type GstRegisterRow,
} from "@ca-suite/shared";
import { mapClient, mapDocument, lineToDb } from "./lib/mappers.js";
import {
  loadMastersBundle,
  syncMastersFromDocument,
  upsertHsnMaster,
  upsertItemMaster,
  upsertPartyMaster,
  upsertUnitMaster,
} from "./lib/sync-masters.js";
import { lockedDocsToZohoPurchaseCsv, lockedDocsToZohoSalesCsv } from "./lib/zoho-export.js";
import { putObject, sha256, storagePath } from "./lib/minio.js";
import { deleteGstDocument } from "./lib/delete-document.js";
import { lookupGstin } from "./lib/gstin-lookup.js";
import type { GSTDocument, CaptureSource, Client } from "@ca-suite/shared";
import {
  resolveAuth,
  createSession,
  destroySession,
  googleAuthUrl,
  googleRedirectUri,
  googleOAuthConfigured,
  exchangeGoogleCode,
  upsertUserFromGoogle,
  devAuthAllowed,
  createOAuthState,
  verifyOAuthState,
  type AuthContext,
} from "./lib/auth.js";

export type { AuthContext };

function emptyParty() {
  return {
    name: "",
    gstin: "",
    address: "",
    city: "",
    state: "",
    state_code: "",
    mobile: "",
    email: "",
    is_registered: false,
  };
}

function multipartFieldValue(field: unknown): string {
  if (typeof field === "string") return field.trim();
  if (Array.isArray(field)) return multipartFieldValue(field[field.length - 1]);
  if (field && typeof field === "object" && "value" in field) {
    const value = (field as { value?: unknown }).value;
    return value == null ? "" : String(value).trim();
  }
  return "";
}

async function audit(
  ctx: AuthContext,
  action: string,
  entityType: string,
  entityId: string,
  meta?: Record<string, unknown>,
  req?: { ip?: string }
) {
  await db.insert(auditLog).values({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action,
    entityType,
    entityId,
    meta: meta ?? null,
    ipAddress: req?.ip ?? null,
  });
}

async function loadDocument(id: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(gstDocuments)
    .where(and(eq(gstDocuments.id, id), eq(gstDocuments.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, id))
    .orderBy(documentLines.seq);
  const issues = await db
    .select()
    .from(documentIssues)
    .where(eq(documentIssues.documentId, id));
  const captureByUpload = row.uploadId
    ? await captureMetaByUploadIds([row.uploadId])
    : new Map();
  const capture = row.uploadId ? captureByUpload.get(row.uploadId) : undefined;
  return mapDocument(row, lines, issues, capture);
}

async function captureMetaByUploadIds(uploadIds: string[]) {
  const ids = [...new Set(uploadIds.filter(Boolean))];
  const out = new Map<
    string,
    { uploaded_by?: string; captured_at?: string; capture_source: CaptureSource }
  >();
  if (ids.length === 0) return out;

  const uploadRows = await db
    .select()
    .from(uploads)
    .where(inArray(uploads.id, ids));
  const userIds = [
    ...new Set(uploadRows.map((u) => u.uploadedById).filter(Boolean)),
  ] as string[];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userById = new Map(
    userRows.map((u) => [u.id, u.name?.trim() || u.email || "Unknown"])
  );

  for (const u of uploadRows) {
    out.set(u.id, {
      uploaded_by: u.uploadedById ? userById.get(u.uploadedById) : undefined,
      captured_at: u.createdAt.toISOString(),
      capture_source: (u.source ?? "web") as CaptureSource,
    });
  }
  return out;
}

async function saveDocumentLines(documentId: string, lines: GSTDocument["lines"]) {
  await db.delete(documentLines).where(eq(documentLines.documentId, documentId));
  if (lines.length === 0) return;
  await db.insert(documentLines).values(
    lines.map((l, i) => ({
      documentId,
      ...lineToDb(l, i + 1),
    }))
  );
}

async function saveDocumentIssues(
  documentId: string,
  issues: GSTDocument["issues"]
) {
  await db.delete(documentIssues).where(eq(documentIssues.documentId, documentId));
  if (issues.length === 0) return;
  await db.insert(documentIssues).values(
    issues.map((i) => ({
      documentId,
      field: i.field,
      severity: i.severity,
      message: i.message,
    }))
  );
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024,
    requestTimeout: 120_000,
    connectionTimeout: 10_000,
  });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.addHook("preHandler", async (req, reply) => {
    const urlPath = req.url.split("?")[0] ?? req.url;
    const open =
      urlPath.startsWith("/api/health") ||
      urlPath.startsWith("/api/auth/google") ||
      urlPath.startsWith("/api/auth/config") ||
      urlPath.startsWith("/api/auth/dev-login") ||
      urlPath.startsWith("/api/auth/session") ||
      urlPath.startsWith("/api/auth/logout");
    if (open) return;
    const ctx = await resolveAuth(req);
    if (!ctx) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    (req as unknown as { auth: AuthContext }).auth = ctx;
  });

  app.get("/api/health", async () => {
    let pipeline: Awaited<ReturnType<typeof getPipelineQueueMetrics>> | null = null;
    try {
      pipeline = await getPipelineQueueMetrics();
    } catch {
      pipeline = null;
    }
    return {
      ok: true,
      service: "ca-suite-api",
      time: new Date().toISOString(),
      pipeline,
    };
  });

  app.get("/api/pipeline/status", async (req, reply) => {
    try {
      await resolveAuth(req);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const metrics = await getPipelineQueueMetrics();
    return {
      ...metrics,
      profile: process.env.DEPLOY_PROFILE ?? "standard",
    };
  });

  app.get("/api/auth/config", async () => {
    const { isAccessRestricted } = await import("./lib/access-control.js");
    return {
      googleEnabled: googleOAuthConfigured(),
      devLoginEnabled: devAuthAllowed(),
      accessRestricted: isAccessRestricted(),
    };
  });

  app.get("/api/auth/session", async (req, reply) => {
    try {
      const ctx = await resolveAuth(req);
      if (!ctx) return reply.status(401).send({ error: "Not signed in" });
      return {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        email: ctx.email,
        name: ctx.name,
        role: ctx.role,
      };
    } catch (err) {
      req.log.error(err);
      return reply.status(503).send({ error: "Auth unavailable — check database connection" });
    }
  });

  app.get("/api/auth/google", async (req, reply) => {
    if (!googleOAuthConfigured()) {
      return reply.status(503).send({ error: "Google sign-in is not configured on the server" });
    }
    const redirectUri = googleRedirectUri(req);
    const state = createOAuthState(reply);
    return reply.redirect(googleAuthUrl(redirectUri, state));
  });

  app.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/api/auth/google/callback",
    async (req, reply) => {
      const loginBase = `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/login`;
      if (req.query.error) {
        return reply.redirect(`${loginBase}?error=oauth`);
      }
      if (!verifyOAuthState(req, reply)) {
        return reply.redirect(`${loginBase}?error=oauth_state`);
      }
      const code = req.query.code;
      if (!code) {
        return reply.status(400).send({ error: "Missing code" });
      }
      const redirectUri = googleRedirectUri(req);
      try {
        const profile = await exchangeGoogleCode(code, redirectUri);
        const user = await upsertUserFromGoogle(profile);
        await createSession(user.id, reply);
        return reply.redirect(process.env.WEB_ORIGIN ?? "http://localhost:5173");
      } catch (err) {
        req.log.error({ err }, "Google OAuth callback failed");
        const { isAccessDeniedError } = await import("./lib/access-control.js");
        const msg = isAccessDeniedError(err)
          ? "access_denied"
          : err instanceof Error && err.message.includes("membership")
            ? "no_membership"
            : "oauth_failed";
        return reply.redirect(`${loginBase}?error=${msg}`);
      }
    }
  );

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.post<{ Body: { email?: string } }>("/api/auth/dev-login", async (req, reply) => {
    if (!devAuthAllowed()) {
      return reply.status(404).send({ error: "Not available" });
    }
    const email = (req.body?.email ?? "admin@ca-suite.local").trim().toLowerCase();
    const { assertEmailAllowed } = await import("./lib/access-control.js");
    try {
      assertEmailAllowed(email);
    } catch (e) {
      const { isAccessDeniedError } = await import("./lib/access-control.js");
      if (isAccessDeniedError(e)) {
        return reply.status(403).send({ error: e.message });
      }
      throw e;
    }
    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, name: "CA Suite Admin" })
        .returning();
    }
    let [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) {
      [tenant] = await db
        .insert(tenants)
        .values({ name: "CA Practice", slug: "ca-practice" })
        .returning();
    }
    const existing = await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.userId, user.id), eq(memberships.tenantId, tenant.id))
      )
      .limit(1);
    if (existing.length === 0) {
      await db.insert(memberships).values({
        tenantId: tenant.id,
        userId: user.id,
        role: "admin",
      });
    }
    await createSession(user.id, reply);
    return {
      tenantId: tenant.id,
      userId: user.id,
      email: user.email,
      role: "admin" as const,
    };
  });

  async function clientsForTenant(tenantId: string, userId: string, role: AuthContext["role"]) {
    const rows = await db
      .select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(clients.name);
    const assigns = await db
      .select()
      .from(clientAssignments)
      .where(eq(clientAssignments.tenantId, tenantId));
    const byClient = new Map<string, string[]>();
    for (const a of assigns) {
      const arr = byClient.get(a.clientId) ?? [];
      arr.push(a.userId);
      byClient.set(a.clientId, arr);
    }
    let list = rows.map((r) => ({
      ...mapClient(r),
      assigned_user_ids: byClient.get(r.id) ?? [],
    }));
    if (role === "operator") {
      list = list.filter(
        (c) =>
          c.assigned_user_ids.length === 0 || c.assigned_user_ids.includes(userId)
      );
    }
    return list;
  }

  app.get("/api/clients", async (req) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    return clientsForTenant(ctx.tenantId, ctx.userId, ctx.role);
  });

  app.post<{ Body: Partial<Client> }>("/api/clients", async (req, reply) => {
    const { tenantId, userId } = (req as unknown as { auth: AuthContext }).auth;
    const b = req.body ?? {};
    if (!b.name || !b.gstin) {
      return reply.status(400).send({ error: "name and gstin required" });
    }
    if (!isValidGSTIN(b.gstin)) {
      return reply.status(400).send({ error: "Invalid GSTIN format" });
    }
    if (b.pan && !isValidPAN(b.pan)) {
      return reply.status(400).send({ error: "Invalid PAN format" });
    }
    const gstin = b.gstin.toUpperCase();
    const pan = (b.pan?.trim() || gstin.slice(2, 12)).toUpperCase();
    const [dup] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.gstin, gstin)))
      .limit(1);
    if (dup) {
      return reply.status(409).send({
        error: "Client with this GSTIN already exists",
        existingId: dup.id,
        ...mapClient(dup),
      });
    }
    const [row] = await db
      .insert(clients)
      .values({
        tenantId,
        name: b.name,
        gstin,
        pan,
        active: b.active ?? true,
        state: b.state,
        stateCode: b.state_code,
        address: b.address,
        mobile: b.mobile,
        email: b.email,
        gstProfile: b.gst_profile ?? null,
      })
      .returning();
    await audit(
      { tenantId, userId } as AuthContext,
      "client.create",
      "client",
      row.id
    );
    return mapClient(row);
  });

  app.patch<{ Params: { id: string }; Body: Partial<Client> }>(
    "/api/clients/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const b = req.body ?? {};
      const [existing] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, req.params.id), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      if (b.gstin && !isValidGSTIN(b.gstin)) {
        return reply.status(400).send({ error: "Invalid GSTIN format" });
      }
      if (b.pan && !isValidPAN(b.pan)) {
        return reply.status(400).send({ error: "Invalid PAN format" });
      }
      const [row] = await db
        .update(clients)
        .set({
          name: b.name ?? existing.name,
          gstin: b.gstin ? b.gstin.toUpperCase() : existing.gstin,
          pan: b.pan?.trim() || (b.gstin ? b.gstin.toUpperCase().slice(2, 12) : existing.pan),
          active: b.active ?? existing.active,
          state: b.state ?? existing.state,
          stateCode: b.state_code ?? existing.stateCode,
          address: b.address ?? existing.address,
          mobile: b.mobile ?? existing.mobile,
          email: b.email ?? existing.email,
          gstProfile: b.gst_profile ?? existing.gstProfile,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, req.params.id))
        .returning();
      await audit(ctx, "client.update", "client", row.id, undefined, req);
      return mapClient(row);
    }
  );

  app.get("/api/parties", async (req) => {
    const { tenantId } = (req as unknown as { auth: AuthContext }).auth;
    const rows = await db
      .select()
      .from(partyMaster)
      .where(eq(partyMaster.tenantId, tenantId));
    const out: Record<string, import("@ca-suite/shared").Party> = {};
    for (const r of rows) {
      out[r.gstin.toUpperCase()] = {
        name: r.name ?? "",
        gstin: r.gstin,
        pan: r.pan ?? undefined,
        address: r.address ?? "",
        city: r.city ?? "",
        state: r.state ?? "",
        state_code: r.stateCode ?? "",
        mobile: r.mobile ?? "",
        email: r.email ?? "",
        is_registered: r.isRegistered ?? true,
      };
    }
    return out;
  });

  app.post<{ Body: import("@ca-suite/shared").Party }>("/api/parties", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const p = req.body;
    if (!p?.gstin || !isValidGSTIN(p.gstin)) {
      return reply.status(400).send({ error: "Valid GSTIN required" });
    }
    await upsertPartyMaster(ctx.tenantId, p);
    return { ...p, gstin: p.gstin.toUpperCase() };
  });

  // ─── GSTIN portal lookup ──────────────────────────────────────────────────
  app.get<{ Params: { gstin: string } }>(
    "/api/gstin/lookup/:gstin",
    async (req, reply) => {
      const { tenantId } = (req as unknown as { auth: AuthContext }).auth;
      const gstin = req.params.gstin.toUpperCase().trim();

      if (!isValidGSTIN(gstin)) {
        return reply.status(400).send({ error: "Invalid GSTIN format" });
      }

      // Check if already in party master for this tenant
      const existing = await db
        .select()
        .from(partyMaster)
        .where(and(eq(partyMaster.tenantId, tenantId), eq(partyMaster.gstin, gstin)))
        .limit(1);
      const known = existing[0] ?? null;

      const info = await lookupGstin(gstin, known ? {
        name: known.name,
        address: known.address,
        city: known.city,
        stateCode: known.stateCode,
      } : null);

      if (!info) {
        return reply.status(404).send({ error: "GSTIN not found or GST portal unavailable" });
      }
      return info;
    }
  );

  app.get("/api/masters", async (req) => {
    const { tenantId } = (req as unknown as { auth: AuthContext }).auth;
    return loadMastersBundle(tenantId);
  });

  app.post<{ Body: { code: string; description?: string; default_gst_rate?: number } }>(
    "/api/masters/hsn",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const row = await upsertHsnMaster(ctx.tenantId, req.body ?? { code: "" });
      if (!row) return reply.status(400).send({ error: "code required" });
      return row;
    }
  );

  app.post<{ Body: { code: string; label?: string } }>(
    "/api/masters/units",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const row = await upsertUnitMaster(ctx.tenantId, req.body ?? { code: "" });
      if (!row) return reply.status(400).send({ error: "code required" });
      return row;
    }
  );

  app.post<{ Body: { description: string; hsn_code?: string; unit_code?: string } }>(
    "/api/masters/items",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const row = await upsertItemMaster(ctx.tenantId, req.body ?? { description: "" });
      if (!row) return reply.status(400).send({ error: "description required" });
      return row;
    }
  );

  app.get("/api/documents", async (req) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const q = req.query as {
      client_id?: string;
      stage?: string;
      financial_year?: string;
      assigned_to?: string;
      limit?: string;
      offset?: string;
    };
    const rows = await db
      .select()
      .from(gstDocuments)
      .where(eq(gstDocuments.tenantId, ctx.tenantId))
      .orderBy(desc(gstDocuments.updatedAt));
    const clientList = await clientsForTenant(ctx.tenantId, ctx.userId, ctx.role);
    const allowedClientIds = new Set(clientList.map((c) => c.id));
    let filtered = rows.filter((r) => {
      if (!allowedClientIds.has(r.clientId)) return false;
      if (q.client_id && r.clientId !== q.client_id) return false;
      if (q.stage && r.stage !== q.stage) return false;
      if (q.financial_year && r.financialYear !== q.financial_year) return false;
      if (q.assigned_to === "me" && r.assignedToUserId !== ctx.userId) return false;
      return true;
    });
    const limit = Math.min(parseInt(q.limit ?? "500", 10) || 500, 2000);
    const offset = parseInt(q.offset ?? "0", 10) || 0;
    filtered = filtered.slice(offset, offset + limit);
    const ids = filtered.map((r) => r.id);
    const allLines =
      ids.length > 0
        ? await db
            .select()
            .from(documentLines)
            .where(inArray(documentLines.documentId, ids))
        : [];
    const allIssues =
      ids.length > 0
        ? await db
            .select()
            .from(documentIssues)
            .where(inArray(documentIssues.documentId, ids))
        : [];
    const linesByDoc = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const arr = linesByDoc.get(line.documentId) ?? [];
      arr.push(line);
      linesByDoc.set(line.documentId, arr);
    }
    const issuesByDoc = new Map<string, typeof allIssues>();
    for (const issue of allIssues) {
      const arr = issuesByDoc.get(issue.documentId) ?? [];
      arr.push(issue);
      issuesByDoc.set(issue.documentId, arr);
    }
    const uploadIds = filtered
      .map((r) => r.uploadId)
      .filter((id): id is string => Boolean(id));
    const captureByUpload = await captureMetaByUploadIds(uploadIds);
    return filtered.map((row) =>
      mapDocument(
        row,
        (linesByDoc.get(row.id) ?? []).sort((a, b) => a.seq - b.seq),
        issuesByDoc.get(row.id) ?? [],
        row.uploadId ? captureByUpload.get(row.uploadId) : undefined
      )
    );
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const doc = await loadDocument(req.params.id, ctx.tenantId);
    if (!doc) return reply.status(404).send({ error: "Not found" });
    const allowed = await clientsForTenant(ctx.tenantId, ctx.userId, ctx.role);
    if (!allowed.some((c) => c.id === doc.client_id)) {
      return reply.status(403).send({ error: "Access denied" });
    }
    return doc;
  });

  app.patch<{ Params: { id: string }; Body: Partial<GSTDocument> }>(
    "/api/documents/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [existing] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, req.params.id),
            eq(gstDocuments.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const allowedClients = await clientsForTenant(ctx.tenantId, ctx.userId, ctx.role);
      if (!allowedClients.some((c) => c.id === existing.clientId)) {
        return reply.status(403).send({ error: "Access denied" });
      }
      if (existing.stage === "locked") {
        return reply.status(409).send({ error: "Document is locked" });
      }
      const b = req.body ?? {};
      await db
        .update(gstDocuments)
        .set({
          docNumber: b.doc_number ?? existing.docNumber,
          docDate: b.doc_date ?? existing.docDate,
          docType: (b.doc_type as typeof existing.docType) ?? existing.docType,
          irnHash: b.irn_hash ?? existing.irnHash,
          ackNumber: b.ack_number ?? existing.ackNumber,
          ackDate: b.ack_date ?? existing.ackDate,
          otherChargesTcs:
            b.other_charges_tcs != null
              ? String(b.other_charges_tcs)
              : existing.otherChargesTcs,
          supplier: (b.supplier as unknown as Record<string, unknown>) ?? existing.supplier,
          recipient: (b.recipient as unknown as Record<string, unknown>) ?? existing.recipient,
          supplyType: b.supply_type ?? existing.supplyType,
          reverseCharge: b.reverse_charge ?? existing.reverseCharge,
          placeOfSupply: b.place_of_supply ?? existing.placeOfSupply,
          taxableAmount: b.taxable_amount != null ? String(b.taxable_amount) : existing.taxableAmount,
          igst: b.igst != null ? String(b.igst) : existing.igst,
          cgst: b.cgst != null ? String(b.cgst) : existing.cgst,
          sgst: b.sgst != null ? String(b.sgst) : existing.sgst,
          cess: b.cess != null ? String(b.cess) : existing.cess,
          total: b.total != null ? String(b.total) : existing.total,
          itcEligible: b.itc_eligible ?? existing.itcEligible,
          b2bCategory: b.b2b_category ?? existing.b2bCategory,
          originalDocumentId: b.original_document_id ?? existing.originalDocumentId,
          assignedToUserId: b.assigned_to_user_id ?? existing.assignedToUserId,
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, req.params.id));
      if (b.lines) await saveDocumentLines(req.params.id, b.lines);
      const merged = await loadDocument(req.params.id, ctx.tenantId);
      if (merged) {
        const gstIssues = validateGstDocument(merged);
        await saveDocumentIssues(req.params.id, b.issues ?? gstIssues);
        const completeness = computeDocumentCompleteness(merged);
        await db
          .update(gstDocuments)
          .set({
            completenessScore: String(completeness.overall_score),
            fieldConfidence: completeness as unknown as Record<string, unknown>,
          })
          .where(eq(gstDocuments.id, req.params.id));
        await syncMastersFromDocument(ctx.tenantId, merged);
      }
      await audit(ctx, "document.update", "document", req.params.id);
      const doc = await loadDocument(req.params.id, ctx.tenantId);
      return doc;
    }
  );

  app.post("/api/documents/upload", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    try {
      await assertPipelineCapacity();
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number; retryAfterSec?: number };
      if (e.statusCode === 503) {
        return reply
          .status(503)
          .header("Retry-After", String(e.retryAfterSec ?? 30))
          .send({ error: e.message, retryAfterSec: e.retryAfterSec ?? 30 });
      }
      throw err;
    }
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "file required" });
    const buf = await data.toBuffer();
    if (buf.length > MAX_UPLOAD_BYTES) {
      return reply.status(413).send({
        error: `File too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)`,
        maxBytes: MAX_UPLOAD_BYTES,
      });
    }
    const clientId = multipartFieldValue(data.fields.client_id);
    // "auto" means the user wants AI to detect the doc type per segment.
    const rawDocType = multipartFieldValue(data.fields.doc_type) || "auto";
    const docType = rawDocType === "auto" ? "purchase_invoice" : rawDocType;
    const fy = multipartFieldValue(data.fields.financial_year) || currentIndianFinancialYear();
    if (!clientId) return reply.status(400).send({ error: "client_id required" });
    const [client] = await db
      .select()
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId))
      )
      .limit(1);
    if (!client) return reply.status(404).send({ error: "Client not found" });

    const hash = sha256(buf);
    const dupCandidates = await db
      .select({ id: gstDocuments.id, stage: gstDocuments.stage })
      .from(gstDocuments)
      .where(
        and(
          eq(gstDocuments.tenantId, ctx.tenantId),
          eq(gstDocuments.contentSha256, hash),
          eq(gstDocuments.segmentIndex, 0)
        )
      );
    const blocker = dupCandidates.find((d) => isBlockingDuplicateStage(d.stage));
    if (blocker) {
      return reply.status(409).send({
        error: "Duplicate document",
        existingId: blocker.id,
        existingStage: blocker.stage,
      });
    }

    const docId = randomUUID();
    const ext = data.filename?.split(".").pop() ?? "pdf";
    const path = storagePath(client.gstin, fy, docType, docId, ext);
    await putObject(path, buf, data.mimetype);

    const [uploadRow] = await db
      .insert(uploads)
      .values({
        tenantId: ctx.tenantId,
        uploadedById: ctx.userId,
        originalFilename: data.filename ?? "upload",
        mimeType: data.mimetype,
        sizeBytes: buf.length,
        contentSha256: hash,
        storagePath: path,
        source: "web",
        currentStage: "received",
        docType:
          rawDocType === "auto"
            ? "unknown"
            : docType === "sales_invoice"
              ? "sales_invoice"
              : docType === "purchase_invoice"
                ? "purchase_bill"
                : "unknown",
      })
      .returning();

    const [docRow] = await db
      .insert(gstDocuments)
      .values({
        id: docId,
        tenantId: ctx.tenantId,
        clientId,
        uploadId: uploadRow.id,
        filename: data.filename ?? "upload",
        docType: docType as typeof gstDocuments.$inferInsert.docType,
        supplier: emptyParty(),
        recipient: emptyParty(),
        stage: "stored",
        extractionMethod: "manual",
        financialYear: fy,
        storagePath: path,
        contentSha256: hash,
        segmentIndex: 0,
      })
      .returning();

    await enqueuePipelineJob(
      "normalize",
      { uploadId: uploadRow.id, tenantId: ctx.tenantId, stage: "normalize", gstDocumentId: docId },
      `${uploadRow.id}-normalize`
    );

    await audit(ctx, "document.upload", "document", docId, { uploadId: uploadRow.id });
    const [uploader] = ctx.userId
      ? await db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, ctx.userId))
          .limit(1)
      : [];
    return mapDocument(docRow, [], [], {
      uploaded_by: uploader?.name?.trim() || uploader?.email || undefined,
      captured_at: uploadRow.createdAt.toISOString(),
      capture_source: "web",
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/lock",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const doc = await loadDocument(req.params.id, ctx.tenantId);
      if (!doc) return reply.status(404).send({ error: "Not found" });
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, doc.client_id), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      const dupRows = await db
        .select({ docNumber: gstDocuments.docNumber })
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, doc.client_id),
            eq(gstDocuments.stage, "locked")
          )
        );
      const existingLockedNumbers = dupRows
        .map((r) => r.docNumber)
        .filter((n): n is string => Boolean(n?.trim()) && n !== "—");
      const check = canLockDocument(doc, {
        clientGstin: client?.gstin,
        existingLockedNumbers: existingLockedNumbers.filter(
          (n) => n !== doc.doc_number
        ),
      });
      if (!check.ok) {
        return reply.status(400).send({ errors: check.errors, warnings: check.warnings });
      }

      for (const p of [doc.supplier, doc.recipient]) {
        await upsertPartyMaster(ctx.tenantId, p);
      }
      await syncMastersFromDocument(ctx.tenantId, doc);

      await db
        .update(gstDocuments)
        .set({
          stage: "locked",
          lockedAt: new Date(),
          recordedAt: new Date().toISOString(),
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, req.params.id));
      const issueRows = await db
        .select()
        .from(documentIssues)
        .where(eq(documentIssues.documentId, req.params.id));
      const errorIds = issueRows.filter((i) => i.severity === "error").map((i) => i.id);
      if (errorIds.length) {
        await db.delete(documentIssues).where(inArray(documentIssues.id, errorIds));
      }
      await audit(ctx, "document.lock", "document", req.params.id, undefined, req);
      return loadDocument(req.params.id, ctx.tenantId);
    }
  );

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/api/documents/:id/reject",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [existing] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, req.params.id),
            eq(gstDocuments.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      if (existing.stage === "locked") {
        return reply.status(409).send({ error: "Document is locked" });
      }
      const reason = req.body?.reason?.trim() ?? "";
      await db
        .update(gstDocuments)
        .set({
          stage: "rejected",
          rejectionReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, req.params.id));
      if (reason) {
        await saveDocumentIssues(req.params.id, [
          { field: "rejection", severity: "warning", message: reason },
        ]);
      }
      await audit(ctx, "document.reject", "document", req.params.id, { reason }, req);
      return loadDocument(req.params.id, ctx.tenantId);
    }
  );

  // ─── Document version history (edit locked docs with audit trail) ────────

  /** List all saved versions for a document, newest first. */
  app.get<{ Params: { id: string } }>(
    "/api/documents/:id/versions",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [doc] = await db
        .select({ id: gstDocuments.id })
        .from(gstDocuments)
        .where(and(eq(gstDocuments.id, req.params.id), eq(gstDocuments.tenantId, ctx.tenantId)))
        .limit(1);
      if (!doc) return reply.status(404).send({ error: "Not found" });

      const current = await loadDocument(req.params.id, ctx.tenantId);
      if (!current) return reply.status(404).send({ error: "Not found" });
      const { buildVersionList } = await import("./lib/version-history.js");
      return buildVersionList(req.params.id, ctx.tenantId, current);
    }
  );

  /** Load a specific version's full snapshot. */
  app.get<{ Params: { id: string; versionId: string } }>(
    "/api/documents/:id/versions/:versionId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [row] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.id, req.params.versionId),
            eq(documentVersions.documentId, req.params.id),
            eq(documentVersions.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!row) return reply.status(404).send({ error: "Version not found" });
      const snap = row.snapshot as unknown as GSTDocument;
      return {
        id: row.id,
        versionNo: row.versionNo,
        changeSummary: row.changeSummary,
        changedBy: row.changedBy,
        changedAt: row.changedAt.toISOString(),
        modificationChannel: "web",
        captureSource: snap.capture_source,
        capturedAt: snap.captured_at,
        uploadedBy: snap.uploaded_by,
        snapshot: snap,
      };
    }
  );

  /**
   * Save current document state as a version, then apply new edits.
   * Body: same as PATCH /documents/:id but also accepts changeSummary.
   * Keeps the document locked.
   */
  app.post<{
    Params: { id: string };
    Body: Partial<Parameters<typeof mapDocument>[0]> & { changeSummary?: string };
  }>(
    "/api/documents/:id/versions",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [existing] = await db
        .select()
        .from(gstDocuments)
        .where(and(eq(gstDocuments.id, req.params.id), eq(gstDocuments.tenantId, ctx.tenantId)))
        .limit(1);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      if (existing.stage !== "locked") {
        return reply.status(409).send({ error: "Only locked documents can be version-edited. Lock first." });
      }

      // Current line items for the snapshot
      const existingLines = await db
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, req.params.id));
      const existingIssues = await db
        .select()
        .from(documentIssues)
        .where(eq(documentIssues.documentId, req.params.id));
      const currentSnapshot = mapDocument(existing, existingLines, existingIssues);

      // Next version number
      const [{ maxVer }] = await db
        .select({ maxVer: max(documentVersions.versionNo) })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, req.params.id));
      const nextVer = (maxVer ?? 0) + 1;

      // Save current state as version
      await db.insert(documentVersions).values({
        documentId: req.params.id,
        tenantId: ctx.tenantId,
        versionNo: nextVer,
        snapshot: currentSnapshot as unknown as Record<string, unknown>,
        changeSummary: req.body?.changeSummary?.trim() ?? "",
        changedBy: ctx.email ?? ctx.userId,
      });

      // Apply the PATCH from the body (reuse same logic as PATCH /documents/:id)
      const body = req.body as unknown as GSTDocument;
      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      if (body.doc_type != null)       updateFields.docType = body.doc_type;
      if (body.doc_number != null)     updateFields.docNumber = body.doc_number;
      if (body.doc_date != null)       updateFields.docDate = body.doc_date;
      if (body.financial_year != null) updateFields.financialYear = body.financial_year;
      if (body.place_of_supply != null) updateFields.placeOfSupply = body.place_of_supply;
      if (body.reverse_charge != null) updateFields.reverseCharge = body.reverse_charge;
      if (body.supply_type != null)    updateFields.supplyType = body.supply_type;
      if (body.itc_eligible != null)   updateFields.itcEligible = body.itc_eligible;
      if (body.taxable_amount != null) updateFields.taxableAmount = String(body.taxable_amount);
      if (body.igst != null)           updateFields.igst = String(body.igst);
      if (body.cgst != null)           updateFields.cgst = String(body.cgst);
      if (body.sgst != null)           updateFields.sgst = String(body.sgst);
      if (body.total != null)          updateFields.total = String(body.total);
      if (body.irn_hash != null)       updateFields.irnHash = body.irn_hash;
      if (body.ack_number != null)     updateFields.ackNumber = body.ack_number;
      if (body.ack_date != null)       updateFields.ackDate = body.ack_date;
      if (body.supplier != null)       updateFields.supplier = body.supplier;
      if (body.recipient != null)      updateFields.recipient = body.recipient;

      await db.update(gstDocuments).set(updateFields).where(eq(gstDocuments.id, req.params.id));

      if (body.lines?.length) {
        await db.delete(documentLines).where(eq(documentLines.documentId, req.params.id));
        if (body.lines.length > 0) {
          await db.insert(documentLines).values(body.lines.map((l, i) => ({ documentId: req.params.id, ...lineToDb(l, i + 1) })));
        }
      }

      await syncMastersFromDocument(ctx.tenantId, body as unknown as GSTDocument);
      await audit(ctx, "document.version_edit", "document", req.params.id, { version: nextVer, summary: req.body?.changeSummary }, req);

      const [updated] = await db.select().from(gstDocuments).where(eq(gstDocuments.id, req.params.id)).limit(1);
      const updatedLines = await db.select().from(documentLines).where(eq(documentLines.documentId, req.params.id));
      const updatedIssues = await db.select().from(documentIssues).where(eq(documentIssues.documentId, req.params.id));
      return { doc: mapDocument(updated, updatedLines, updatedIssues), versionNo: nextVer };
    }
  );

  /**
   * Restore a saved version as the new current state (creates a new version entry for the restore act).
   */
  app.post<{ Params: { id: string; versionId: string }; Body: { changeSummary?: string } }>(
    "/api/documents/:id/versions/:versionId/restore",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [vrow] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.id, req.params.versionId),
            eq(documentVersions.documentId, req.params.id),
            eq(documentVersions.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!vrow) return reply.status(404).send({ error: "Version not found" });

      // Delegate to the version-edit endpoint logic using the snapshot as body
      const snapshot = vrow.snapshot as unknown as GSTDocument;
      const summary = req.body?.changeSummary?.trim() || `Restored from v${vrow.versionNo}`;

      // Fake inner request by reusing the same insert logic
      const [existing] = await db
        .select().from(gstDocuments)
        .where(and(eq(gstDocuments.id, req.params.id), eq(gstDocuments.tenantId, ctx.tenantId)))
        .limit(1);
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const existingLines = await db.select().from(documentLines).where(eq(documentLines.documentId, req.params.id));
      const existingIssues = await db.select().from(documentIssues).where(eq(documentIssues.documentId, req.params.id));
      const currentSnapshot = mapDocument(existing, existingLines, existingIssues);

      const [{ maxVer }] = await db.select({ maxVer: max(documentVersions.versionNo) }).from(documentVersions).where(eq(documentVersions.documentId, req.params.id));
      const nextVer = (maxVer ?? 0) + 1;

      await db.insert(documentVersions).values({
        documentId: req.params.id,
        tenantId: ctx.tenantId,
        versionNo: nextVer,
        snapshot: currentSnapshot as unknown as Record<string, unknown>,
        changeSummary: summary,
        changedBy: ctx.email ?? ctx.userId,
      });

      await db.update(gstDocuments).set({
        docType: snapshot.doc_type as typeof gstDocuments.$inferInsert["docType"],
        docNumber: snapshot.doc_number,
        docDate: snapshot.doc_date,
        financialYear: snapshot.financial_year,
        placeOfSupply: snapshot.place_of_supply,
        reverseCharge: snapshot.reverse_charge,
        supplyType: snapshot.supply_type as typeof gstDocuments.$inferInsert["supplyType"],
        itcEligible: snapshot.itc_eligible,
        taxableAmount: String(snapshot.taxable_amount),
        igst: String(snapshot.igst),
        cgst: String(snapshot.cgst),
        sgst: String(snapshot.sgst),
        total: String(snapshot.total),
        irnHash: snapshot.irn_hash,
        ackNumber: snapshot.ack_number,
        ackDate: snapshot.ack_date,
        supplier: snapshot.supplier as unknown as Record<string, unknown>,
        recipient: snapshot.recipient as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      }).where(eq(gstDocuments.id, req.params.id));

      if (snapshot.lines?.length) {
        await db.delete(documentLines).where(eq(documentLines.documentId, req.params.id));
        await db.insert(documentLines).values(snapshot.lines.map((l, i) => ({ documentId: req.params.id, ...lineToDb(l, i + 1) })));
      }

      await audit(ctx, "document.version_restore", "document", req.params.id, { restoredFrom: vrow.versionNo, newVersion: nextVer }, req);
      return { ok: true, versionNo: nextVer };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/retry",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const [row] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, req.params.id),
            eq(gstDocuments.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!row?.uploadId) return reply.status(404).send({ error: "Not found" });
      const { extractions, salesInvoiceHeaders, purchaseBillHeaders, pipelineJobs } =
        await import("@ca-suite/db");
      await db.delete(extractions).where(eq(extractions.uploadId, row.uploadId));
      await db
        .delete(salesInvoiceHeaders)
        .where(eq(salesInvoiceHeaders.uploadId, row.uploadId));
      await db
        .delete(purchaseBillHeaders)
        .where(eq(purchaseBillHeaders.uploadId, row.uploadId));
      await db.delete(pipelineJobs).where(eq(pipelineJobs.uploadId, row.uploadId));
      await db.delete(documentLines).where(eq(documentLines.documentId, req.params.id));
      await db.delete(documentIssues).where(eq(documentIssues.documentId, req.params.id));
      await db
        .update(gstDocuments)
        .set({
          stage: "stored",
          rejectionReason: null,
          docNumber: "",
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, req.params.id));
      await db
        .update(uploads)
        .set({ currentStage: "received", updatedAt: new Date() })
        .where(eq(uploads.id, row.uploadId));
      const retryJobId = `${row.uploadId}-normalize-retry-${Date.now()}`;
      await enqueuePipelineJob(
        "normalize",
        {
          uploadId: row.uploadId,
          tenantId: ctx.tenantId,
          stage: "normalize",
          gstDocumentId: row.id,
        },
        retryJobId
      );
      await audit(ctx, "document.retry", "document", req.params.id);
      return loadDocument(req.params.id, ctx.tenantId);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const result = await deleteGstDocument(req.params.id, ctx.tenantId);
      if (!result.ok) {
        return reply.status(result.status).send({ error: result.error });
      }
      await audit(ctx, "document.delete", "document", req.params.id, undefined, req);
      return { ok: true, id: req.params.id };
    }
  );

  app.post<{ Body: { ids?: string[] } }>(
    "/api/documents/bulk-delete",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const ids = [...new Set((req.body?.ids ?? []).filter(Boolean))];
      if (ids.length === 0) {
        return reply.status(400).send({ error: "ids required" });
      }
      const deleted: string[] = [];
      const errors: { id: string; error: string }[] = [];
      for (const id of ids) {
        const result = await deleteGstDocument(id, ctx.tenantId);
        if (!result.ok) {
          errors.push({ id, error: result.error });
          continue;
        }
        await audit(ctx, "document.delete", "document", id, { bulk: true }, req);
        deleted.push(id);
      }
      return { deleted, errors };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/documents/:id/file",
    async (req, reply) => {
      const { tenantId } = (req as unknown as { auth: AuthContext }).auth;
      const [row] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, req.params.id),
            eq(gstDocuments.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!row?.storagePath) return reply.status(404).send({ error: "Not found" });

      const [upload] = await db
        .select({ mimeType: uploads.mimeType })
        .from(uploads)
        .where(eq(uploads.id, row.uploadId!))
        .limit(1);

      const { getObjectStream, statObject } = await import("./lib/minio.js");
      const stat = await statObject(row.storagePath);
      const stream = await getObjectStream(row.storagePath);
      const mime =
        upload?.mimeType ||
        (stat.metaData?.["content-type"] as string | undefined) ||
        "application/octet-stream";

      return reply
        .header("Content-Type", mime)
        .header("Content-Disposition", `inline; filename="${encodeURIComponent(row.filename)}"`)
        .header("Cache-Control", "private, max-age=3600")
        .send(stream);
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/documents/:id/preview-url",
    async (req, reply) => {
      const { tenantId } = (req as unknown as { auth: AuthContext }).auth;
      const [row] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, req.params.id),
            eq(gstDocuments.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!row) return reply.status(404).send({ error: "Not found" });
      // Same-origin HTTPS proxy — avoids mixed content (http://minio:9000) in browser iframe
      let url = `/api/documents/${req.params.id}/file`;
      if (row.pageStart != null && row.pageStart > 0) {
        url = `${url}#page=${row.pageStart}`;
      }
      return { url };
    }
  );

  app.get<{ Params: { kind: string } }>("/api/registers/:kind", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const q = req.query as { client_id?: string; financial_year?: string };
    const kind = req.params.kind;
    const salesTypes = ["sales_invoice", "debit_note_issued", "credit_note_issued"];
    const purchTypes = ["purchase_invoice", "debit_note_received", "credit_note_received"];
    const types = kind === "sales" ? salesTypes : kind === "purchase" ? purchTypes : null;
    if (!types) return reply.status(400).send({ error: "kind must be sales or purchase" });

    const rows = await db
      .select()
      .from(gstDocuments)
      .where(
        and(eq(gstDocuments.tenantId, ctx.tenantId), eq(gstDocuments.stage, "locked"))
      );
    const filtered = rows.filter((r) => {
      if (!types.includes(r.docType)) return false;
      if (q.client_id && r.clientId !== q.client_id) return false;
      if (q.financial_year) {
        // Use doc_date-derived FY as the source of truth (same logic as Records screen).
        // Fall back to the stored financial_year column if doc_date is absent.
        const effectiveFy =
          (r.docDate ? financialYearFromIsoDate(r.docDate) : null) ?? r.financialYear;
        if (effectiveFy !== q.financial_year) return false;
      }
      return true;
    });

    const out: GstRegisterRow[] = filtered.map((r) => {
      const sup = r.supplier as Record<string, string>;
      const rec = r.recipient as Record<string, string>;
      const isSales = salesTypes.includes(r.docType);
      const party = isSales ? rec : sup;
      return {
        document_id: r.id,
        doc_number: r.docNumber ?? "",
        doc_date: r.docDate ?? "",
        party_name: String(party.name ?? ""),
        party_gstin: String(party.gstin ?? ""),
        place_of_supply: r.placeOfSupply ?? "",
        taxable_amount: parseFloat(r.taxableAmount ?? "0"),
        igst: parseFloat(r.igst ?? "0"),
        cgst: parseFloat(r.cgst ?? "0"),
        sgst: parseFloat(r.sgst ?? "0"),
        cess: parseFloat(r.cess ?? "0"),
        total: parseFloat(r.total ?? "0"),
        itc_eligible: r.itcEligible ?? true,
        reverse_charge: r.reverseCharge ?? false,
        financial_year: r.financialYear ?? "",
      };
    });
    return out;
  });

  app.get("/api/export/zoho", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const q = req.query as { type?: string; client_id?: string; financial_year?: string };
    const type = q.type === "purchase" ? "purchase" : "sales";
    const all = await db
      .select()
      .from(gstDocuments)
      .where(
        and(eq(gstDocuments.tenantId, ctx.tenantId), eq(gstDocuments.stage, "locked"))
      );
    const ids = all
      .filter((r) => {
        if (q.client_id && r.clientId !== q.client_id) return false;
        if (q.financial_year) {
          const effectiveFy =
            (r.docDate ? financialYearFromIsoDate(r.docDate) : null) ?? r.financialYear;
          if (effectiveFy !== q.financial_year) return false;
        }
        return true;
      })
      .map((r) => r.id);
    const docs: GSTDocument[] = [];
    for (const id of ids) {
      const d = await loadDocument(id, ctx.tenantId);
      if (d) docs.push(d);
    }
    const csv =
      type === "purchase"
        ? lockedDocsToZohoPurchaseCsv(docs)
        : lockedDocsToZohoSalesCsv(docs);
    await audit(ctx, "export.zoho_csv", "export", `${type}_${q.financial_year ?? "all"}`, {
      type,
      client_id: q.client_id ?? null,
      financial_year: q.financial_year ?? null,
      doc_count: docs.length,
    }, req);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="zoho_${type}_${q.financial_year ?? "all"}.csv"`
    );
    return csv;
  });

  app.get("/api/audit-log", async (req) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.tenantId, ctx.tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(200);
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const userRows =
      userIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, userIds as string[]))
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, { name: u.name, email: u.email }]));
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity_type: r.entityType,
      entity_id: r.entityId,
      user_id: r.userId,
      user_name: r.userId ? (userMap.get(r.userId)?.name ?? null) : null,
      user_email: r.userId ? (userMap.get(r.userId)?.email ?? null) : null,
      created_at: r.createdAt.toISOString(),
      ip_address: r.ipAddress ?? undefined,
    }));
  });

  app.put<{ Params: { id: string }; Body: { user_ids?: string[] } }>(
    "/api/clients/:id/assignments",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      if (ctx.role === "operator") {
        return reply.status(403).send({ error: "Managers or admins only" });
      }
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, req.params.id), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Not found" });
      const userIds = req.body?.user_ids ?? [];
      await db
        .delete(clientAssignments)
        .where(
          and(
            eq(clientAssignments.tenantId, ctx.tenantId),
            eq(clientAssignments.clientId, req.params.id)
          )
        );
      if (userIds.length) {
        await db.insert(clientAssignments).values(
          userIds.map((userId) => ({
            tenantId: ctx.tenantId,
            clientId: req.params.id,
            userId,
          }))
        );
      }
      await audit(ctx, "client.assign", "client", req.params.id, { userIds });
      return { user_ids: userIds };
    }
  );

  app.post<{ Body: { ids?: string[] } }>("/api/documents/bulk-lock", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const ids = req.body?.ids ?? [];
    const locked: string[] = [];
    const errors: { id: string; errors: string[] }[] = [];
    const lockedNumbersByClient = new Map<string, Set<string>>();

    for (const id of ids) {
      const doc = await loadDocument(id, ctx.tenantId);
      if (!doc) {
        errors.push({ id, errors: ["Not found"] });
        continue;
      }
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, doc.client_id), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      let existingLockedNumbers =
        lockedNumbersByClient.get(doc.client_id) ??
        new Set(
          (
            await db
              .select({ docNumber: gstDocuments.docNumber })
              .from(gstDocuments)
              .where(
                and(
                  eq(gstDocuments.tenantId, ctx.tenantId),
                  eq(gstDocuments.clientId, doc.client_id),
                  eq(gstDocuments.stage, "locked")
                )
              )
          )
            .map((r) => r.docNumber)
            .filter((n): n is string => Boolean(n?.trim()) && n !== "—")
        );
      if (!lockedNumbersByClient.has(doc.client_id)) {
        lockedNumbersByClient.set(doc.client_id, existingLockedNumbers);
      }

      const check = canLockDocument(doc, {
        clientGstin: client?.gstin,
        existingLockedNumbers: [...existingLockedNumbers].filter((n) => n !== doc.doc_number),
      });
      if (!check.ok) {
        errors.push({ id, errors: check.errors });
        continue;
      }
      const completeness = computeDocumentCompleteness(doc);
      if (completeness.overall_score < 60) {
        errors.push({ id, errors: [`Completeness score too low (${completeness.overall_score}%) — review before bulk lock`] });
        continue;
      }

      for (const p of [doc.supplier, doc.recipient]) {
        await upsertPartyMaster(ctx.tenantId, p);
      }
      await syncMastersFromDocument(ctx.tenantId, doc);

      await db
        .update(gstDocuments)
        .set({
          stage: "locked",
          lockedAt: new Date(),
          recordedAt: new Date().toISOString(),
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, id));

      const issueRows = await db
        .select()
        .from(documentIssues)
        .where(eq(documentIssues.documentId, id));
      const errorIds = issueRows.filter((i) => i.severity === "error").map((i) => i.id);
      if (errorIds.length) {
        await db.delete(documentIssues).where(inArray(documentIssues.id, errorIds));
      }

      if (doc.doc_number && doc.doc_number !== "—") {
        existingLockedNumbers.add(doc.doc_number);
      }
      await audit(ctx, "document.lock", "document", id, { bulk: true }, req);
      locked.push(id);
    }
    return { locked, errors };
  });

  app.get("/api/compliance/calendar", async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthName = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
    return {
      month: monthName,
      reminders: [
        { return_type: "GSTR-1", due_day: 11, note: "Outward supplies for previous month" },
        { return_type: "GSTR-3B", due_day: 20, note: "Summary return and tax payment" },
        { return_type: "GSTR-2B", due_day: 14, note: "Reconcile purchase ITC before 3B" },
      ],
    };
  });

  return app;
}

const port = parseInt(process.env.API_PORT ?? "4000", 10);

export async function startServer() {
  const app = await buildApp();
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}

if (!process.env.VITEST) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
