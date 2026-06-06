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
import { eq, and, desc, inArray, lt, max, sql, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@ca-suite/db/client";
import {
  auditLog,
  authSessions,
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
  masterHsn,
  hsnSacMaster,
  filingDeadlines,
  itcReconciliationSnapshots,
  amendmentDocuments,
  zohoSyncConfig,
  gstPortalConfig,
  emailForwardConfig,
  categoryMaster,
  zohoSyncLog,
  subscriptionPlans,
  tenantSubscriptions,
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
  docTypesForRegisterKind,
  registerKindOrNull,
  isOutwardRegisterDocType,
  parseUserPreferences,
  mergeUserPreferences,
  normalizeDocType,
  type GstRegisterRow,
} from "@ca-suite/shared";
import { mapClient, mapDocument, lineToDb } from "./lib/mappers.js";
import {
  deferUploadForBudget,
  getLlmBudgetStatus,
  listDeferredUploads,
  listRecentLlmUsage,
  setDailyBudgetUsd,
} from "@ca-suite/db/llm-budget-service";
import {
  loadMastersBundle,
  syncMastersFromDocument,
  upsertHsnMaster,
  upsertItemMaster,
  upsertPartyMaster,
  upsertUnitMaster,
  loadClientHsnMaster,
  upsertClientHsnMaster,
} from "./lib/sync-masters.js";
import {
  upsertHsnSacMaster,
  getHsnSacMaster,
  listHsnSacMasters,
  validateHsnRate,
  importHsnSacFromFile,
  verifyHsnSacAgainstSource,
  deleteHsnSacMaster,
  markHsnSacAsVerified,
  exportHsnSacToCsv,
} from "./lib/hsn-sync.js";
import { lockedDocsToZohoPurchaseCsv, lockedDocsToZohoSalesCsv } from "./lib/zoho-export.js";
import { putObject, sha256, storagePath } from "./lib/minio.js";
import { deleteGstDocument } from "./lib/delete-document.js";
import { lookupGstin } from "./lib/gstin-lookup.js";
import {
  initializeZohoSync,
  syncZohoBooks,
  initializeGstPortalSync,
  fetchGstr1FromPortal,
  fetchGstr2bFromPortal,
  initializeEmailForwarding,
  initializeCategoryMaster,
  assignCategoryToLineItem,
  autoSuggestCategory,
  zohoTokenManager,
} from "./lib/integrations.js";
import { enqueueZohoPush, getZohoReconcileQueue, isZohoSyncEnabled } from "./lib/zoho-queue.js";
import { hsnValidator } from "./lib/hsn-validator.js";
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
import {
  passwordLoginEnabled,
  authenticateWithPassword,
  LoginInvalidError,
  LoginRateLimitedError,
} from "./lib/password-auth.js";

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
    {
      uploaded_by?: string;
      captured_at?: string;
      capture_source: CaptureSource;
      budget_deferred?: boolean;
    }
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
      budget_deferred: u.budgetDeferred ?? false,
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
      urlPath.startsWith("/api/auth/password-login") ||
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
      oauth: {
        googleConfigured: googleOAuthConfigured(),
        redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "(derived from WEB_ORIGIN/x-forwarded-host)",
      },
    };
  });

  app.get("/api/pipeline/status", async (req, reply) => {
    const pipelineAuth = await resolveAuth(req);
    if (!pipelineAuth) {
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
      passwordLoginEnabled: passwordLoginEnabled(),
      accessRestricted: isAccessRestricted(),
    };
  });

  app.get("/api/auth/session", async (req, reply) => {
    try {
      const ctx = await resolveAuth(req);
      if (!ctx) return { signedIn: false as const };
      return {
        signedIn: true as const,
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

  app.get("/api/users/me", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: ctx.role,
      preferences: parseUserPreferences(user.preferences),
      authProvider: googleOAuthConfigured() ? "google" : "dev",
    };
  });

  app.get("/api/users/me/preferences", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return { preferences: parseUserPreferences(user.preferences) };
  });

  app.patch<{ Body: Record<string, unknown> }>("/api/users/me/preferences", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const next = mergeUserPreferences(parseUserPreferences(user.preferences), req.body ?? {});
    await db.update(users).set({ preferences: next }).where(eq(users.id, ctx.userId));
    return { preferences: next };
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

  app.post<{ Body: { email?: string; password?: string } }>(
    "/api/auth/password-login",
    async (req, reply) => {
      if (!passwordLoginEnabled()) {
        return reply.status(404).send({ error: "Not available" });
      }
      const email = String(req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");
      const clientIp =
        String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() ||
        req.ip;

      try {
        const { userId } = await authenticateWithPassword(email, password, clientIp);
        const [membership] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.userId, userId))
          .limit(1);
        if (!membership) {
          return reply.status(403).send({ error: "No practice membership for this account." });
        }
        await createSession(userId, reply);
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        return {
          tenantId: membership.tenantId,
          userId,
          email: user?.email ?? email,
          role: membership.role,
        };
      } catch (err) {
        if (err instanceof LoginRateLimitedError) {
          return reply
            .status(429)
            .header("Retry-After", String(err.retryAfterSec))
            .send({ error: err.message, retryAfterSec: err.retryAfterSec });
        }
        if (err instanceof LoginInvalidError) {
          return reply.status(401).send({ error: err.message });
        }
        req.log.error({ err }, "password-login failed");
        return reply.status(401).send({ error: "Invalid email or password." });
      }
    }
  );

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
        zohoBooksOrgId: b.zoho_books_org_id?.trim() || null,
      })
      .returning();
    if (row.zohoBooksOrgId) {
      const { upsertZohoOrgMapping } = await import("./lib/zoho-org-sync.js");
      await upsertZohoOrgMapping(tenantId, row.id, row.zohoBooksOrgId);
    }
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

  // ─── CLIENT HSN MASTER ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/clients/:id/masters/hsn",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const clientId = req.params.id;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const hsnList = await loadClientHsnMaster(ctx.tenantId, clientId);
      return { hsn: hsnList };
    }
  );

  app.post<{
    Params: { id: string };
    Body: { code: string; description?: string; default_gst_rate?: number };
  }>(
    "/api/clients/:id/masters/hsn",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const clientId = req.params.id;
      const body = req.body ?? {};

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      // Validation: code required
      if (!body.code || !body.code.trim()) {
        return reply.status(400).send({ error: "HSN code required" });
      }

      // Validation: code format (4-8 digits)
      const code = body.code.trim();
      if (!/^\d{4,8}$/.test(code)) {
        return reply.status(400).send({
          error: "Invalid HSN code format. Must be 4-8 digits.",
        });
      }

      // Validation: rate in [0-100]
      if (body.default_gst_rate != null) {
        if (body.default_gst_rate < 0 || body.default_gst_rate > 100) {
          return reply.status(400).send({
            error: "GST rate must be between 0 and 100",
          });
        }
      }

      const result = await upsertClientHsnMaster(ctx.tenantId, clientId, body);
      if (!result) {
        return reply.status(400).send({ error: "Failed to save HSN" });
      }

      await audit(ctx, "client.hsn.upsert", "hsn_master", code, {
        clientId,
        rate: body.default_gst_rate,
      });

      return result;
    }
  );

  app.delete<{ Params: { id: string; code: string } }>(
    "/api/clients/:id/masters/hsn/:code",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const clientId = req.params.id;
      const code = req.params.code.trim();

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId))
        )
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      // Only delete if use_count = 0
      const [hsn] = await db
        .select()
        .from(masterHsn)
        .where(
          and(
            eq(masterHsn.tenantId, ctx.tenantId),
            eq(masterHsn.code, code),
            eq(masterHsn.clientId, clientId)
          )
        )
        .limit(1);

      if (!hsn) return reply.status(404).send({ error: "HSN not found" });

      if (hsn.useCount > 0) {
        return reply.status(400).send({
          error: "Cannot delete HSN with usage count > 0",
          useCount: hsn.useCount,
        });
      }

      await db
        .delete(masterHsn)
        .where(
          and(
            eq(masterHsn.tenantId, ctx.tenantId),
            eq(masterHsn.code, code),
            eq(masterHsn.clientId, clientId)
          )
        );

      await audit(ctx, "client.hsn.delete", "hsn_master", code, {
        clientId,
      });

      return { ok: true };
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

  // ============ HSN/SAC MASTER ENDPOINTS ============

  // Get all HSN/SAC codes with filters
  app.get<{ Querystring: { type?: string; verified?: string; source?: string } }>(
    "/api/masters/hsn-sac",
    async (req) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { type?: string; verified?: string; source?: string };

      const filters: Parameters<typeof listHsnSacMasters>[1] = {};
      if (q.type === "HSN" || q.type === "SAC") filters.type = q.type;
      if (q.verified === "true") filters.verified = true;
      if (q.verified === "false") filters.verified = false;
      if (q.source) filters.source = q.source;

      const codes = await listHsnSacMasters(ctx.tenantId, filters);
      return { codes };
    }
  );

  // Get single HSN/SAC code details
  app.get<{ Params: { code: string }; Querystring: { type?: string } }>(
    "/api/masters/hsn-sac/:code",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { code } = req.params;
      const type = (req.query as { type?: string }).type as "HSN" | "SAC" | undefined;

      if (!type || !["HSN", "SAC"].includes(type)) {
        return reply.status(400).send({ error: "type parameter required (HSN or SAC)" });
      }

      const master = await getHsnSacMaster(ctx.tenantId, code, type);
      if (!master) {
        return reply.status(404).send({ error: "Code not found" });
      }

      return master;
    }
  );

  // Create or update HSN/SAC code
  app.post<{
    Body: {
      code: string;
      type: "HSN" | "SAC";
      description: string;
      gstRate: number;
      cgstRate?: number;
      sgstRate?: number;
      validFrom?: string;
      validTo?: string;
    };
  }>(
    "/api/masters/hsn-sac",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const body = req.body;

      if (!body || !body.code || !body.type || !body.description || body.gstRate === undefined) {
        return reply.status(400).send({
          error: "code, type, description, and gstRate are required",
        });
      }

      try {
        const result = await upsertHsnSacMaster(
          ctx.tenantId,
          {
            code: body.code,
            type: body.type,
            description: body.description,
            gstRate: body.gstRate,
            cgstRate: body.cgstRate,
            sgstRate: body.sgstRate,
            validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
            validTo: body.validTo ? new Date(body.validTo) : undefined,
          },
          "MANUAL"
        );

        await audit(ctx, "hsn_sac.upsert", "hsn_sac_master", result.id, body);

        const master = await getHsnSacMaster(ctx.tenantId, result.code, result.type as any);
        return master;
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Failed to save HSN/SAC code",
        });
      }
    }
  );

  // Bulk import HSN/SAC from file
  app.post<{ Body: { format?: "json" | "csv" } }>(
    "/api/masters/hsn-sac/bulk",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;

      try {
        const parts = await req.file();
        if (!parts) {
          return reply.status(400).send({ error: "No file uploaded" });
        }

        const buffer = await parts.toBuffer();
        const format = ((req.body as any)?.format || "csv") as "json" | "csv";

        const result = await importHsnSacFromFile(ctx.tenantId, buffer, format, "IMPORTED");

        await audit(ctx, "hsn_sac.bulk_import", "hsn_sac_master", ctx.tenantId, {
          imported: result.imported,
          failed: result.failed,
        });

        return result;
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Failed to import HSN/SAC codes",
        });
      }
    }
  );

  // Validate HSN/SAC code and rate
  app.post<{
    Body: {
      code: string;
      type: "HSN" | "SAC";
      gstRate: number;
    };
  }>(
    "/api/masters/hsn-sac/validate",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { code, type, gstRate } = req.body;

      if (!code || !type || gstRate === undefined) {
        return reply.status(400).send({
          error: "code, type, and gstRate are required",
        });
      }

      const result = await validateHsnRate(ctx.tenantId, code, gstRate, type);
      return result;
    }
  );

  // Verify all HSN/SAC codes against source
  app.post<{ Body: { type?: "HSN" | "SAC" } }>(
    "/api/masters/hsn-sac/verify-all",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const type = ((req.body as any)?.type || "HSN") as "HSN" | "SAC";

      const result = await verifyHsnSacAgainstSource(ctx.tenantId, type);

      await audit(ctx, "hsn_sac.verify_all", "hsn_sac_master", ctx.tenantId, {
        verified: result.verified,
        failed: result.failed,
      });

      return result;
    }
  );

  // Mark codes as verified
  app.post<{
    Body: {
      codes: Array<{ code: string; type: "HSN" | "SAC" }>;
      verified?: boolean;
    };
  }>(
    "/api/masters/hsn-sac/mark-verified",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { codes, verified = true } = req.body;

      if (!codes || codes.length === 0) {
        return reply.status(400).send({ error: "codes array is required" });
      }

      const updated = await markHsnSacAsVerified(ctx.tenantId, codes, verified);

      await audit(ctx, "hsn_sac.mark_verified", "hsn_sac_master", ctx.tenantId, {
        count: updated,
        verified,
      });

      return { updated };
    }
  );

  // Delete HSN/SAC code
  app.delete<{ Params: { code: string }; Querystring: { type?: string } }>(
    "/api/masters/hsn-sac/:code",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { code } = req.params;
      const type = (req.query as { type?: string }).type as "HSN" | "SAC" | undefined;

      if (!type || !["HSN", "SAC"].includes(type)) {
        return reply.status(400).send({ error: "type parameter required (HSN or SAC)" });
      }

      await deleteHsnSacMaster(ctx.tenantId, code, type);

      await audit(ctx, "hsn_sac.delete", "hsn_sac_master", code, { type });

      return { deleted: true };
    }
  );

  // Export HSN/SAC masters to CSV
  app.get<{ Querystring: { type?: string; verified?: string } }>(
    "/api/masters/hsn-sac/export/csv",
    async (req) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { type?: string; verified?: string };

      const filters: Parameters<typeof exportHsnSacToCsv>[1] = {};
      if (q.type === "HSN" || q.type === "SAC") filters.type = q.type;
      if (q.verified === "true") filters.verified = true;
      if (q.verified === "false") filters.verified = false;

      const csv = await exportHsnSacToCsv(ctx.tenantId, filters);

      return { csv, filename: `hsn-sac-masters-${new Date().toISOString().split("T")[0]}.csv` };
    }
  );

  app.get("/api/documents", async (req) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const q = req.query as {
      client_id?: string;
      stage?: string;
      financial_year?: string;
      assigned_to?: string;
      capture_source?: string;
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

    // TIER 2: Apply capture_source filter if provided
    let docs = filtered.map((row) =>
      mapDocument(
        row,
        (linesByDoc.get(row.id) ?? []).sort((a, b) => a.seq - b.seq),
        issuesByDoc.get(row.id) ?? [],
        row.uploadId ? captureByUpload.get(row.uploadId) : undefined
      )
    );

    if (q.capture_source) {
      docs = docs.filter(
        (d) => d.capture_source === q.capture_source
      );
    }

    return docs;
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

    const budget = await getLlmBudgetStatus();
    if (budget.can_spend) {
      await enqueuePipelineJob(
        "normalize",
        { uploadId: uploadRow.id, tenantId: ctx.tenantId, stage: "normalize", gstDocumentId: docId },
        `${uploadRow.id}-normalize`
      );
    } else {
      await deferUploadForBudget(uploadRow.id, "normalize", docId);
    }

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
      budget_deferred: !budget.can_spend,
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

      const [zohoCfg] = await db
        .select()
        .from(zohoSyncConfig)
        .where(
          and(eq(zohoSyncConfig.tenantId, ctx.tenantId), eq(zohoSyncConfig.clientId, doc.client_id))
        )
        .limit(1);

      if (
        zohoCfg?.isActive &&
        zohoCfg.authMethod === "oauth2" &&
        isZohoSyncEnabled(ctx.tenantId)
      ) {
        await db
          .update(gstDocuments)
          .set({ zohoSyncStatus: "pending", updatedAt: new Date() })
          .where(eq(gstDocuments.id, req.params.id));
        await enqueueZohoPush({
          docId: req.params.id,
          tenantId: ctx.tenantId,
          clientId: doc.client_id,
        });
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
        .set({
          currentStage: "received",
          budgetDeferred: false,
          budgetResumeStage: null,
          budgetResumeDocumentId: null,
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, row.uploadId));
      const budget = await getLlmBudgetStatus();
      const retryJobId = `${row.uploadId}-normalize-retry-${Date.now()}`;
      if (budget.can_spend) {
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
      } else {
        await deferUploadForBudget(row.uploadId, "normalize", row.id);
      }
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
      if (!row.storagePath) return reply.status(404).send({ error: "File not yet stored" });

      // Same-origin API stream (Vercel /api rewrite → VPS). Presigned MinIO URLs use the
      // internal docker host (http://minio:9000) and are blocked as mixed content on HTTPS.
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
    const types = docTypesForRegisterKind(req.params.kind);
    if (!types) return reply.status(400).send({ error: "Invalid register kind" });

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
        const effectiveFy =
          (r.docDate ? financialYearFromIsoDate(r.docDate) : null) ?? r.financialYear;
        if (effectiveFy !== q.financial_year) return false;
      }
      return true;
    });

    const out: GstRegisterRow[] = filtered.map((r) => {
      const sup = r.supplier as Record<string, string>;
      const rec = r.recipient as Record<string, string>;
      const isSales = isOutwardRegisterDocType(r.docType);
      const party = isSales ? rec : sup;
      return {
        document_id: r.id,
        doc_type: normalizeDocType(r.docType),
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
    const q = req.query as {
      type?: string;
      client_id?: string;
      financial_year?: string;
      register_kind?: string;
    };
    const type = q.type === "purchase" ? "purchase" : "sales";
    const registerTypes = q.register_kind ? docTypesForRegisterKind(q.register_kind) : null;
    const all = await db
      .select()
      .from(gstDocuments)
      .where(
        and(eq(gstDocuments.tenantId, ctx.tenantId), eq(gstDocuments.stage, "locked"))
      );
    const ids = all
      .filter((r) => {
        if (registerTypes && !registerTypes.includes(r.docType)) return false;
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

  app.get("/api/admin/observe", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    if (ctx.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
    const status = await getLlmBudgetStatus();
    const deferred = await listDeferredUploads(100);
    const recent = await listRecentLlmUsage(40);
    const docIds = recent.map((r) => r.documentId).filter(Boolean) as string[];
    const docRows =
      docIds.length > 0
        ? await db
            .select({ id: gstDocuments.id, filename: gstDocuments.filename })
            .from(gstDocuments)
            .where(inArray(gstDocuments.id, docIds))
        : [];
    const filenameByDoc = new Map(docRows.map((d) => [d.id, d.filename]));
    return {
      ...status,
      deferred_count: deferred.length,
      deferred_uploads: deferred.map((u) => ({
        id: u.id,
        filename: u.originalFilename,
        current_stage: u.currentStage,
        resume_stage: u.budgetResumeStage,
        created_at: u.createdAt.toISOString(),
      })),
      recent_usage: recent.map((r) => ({
        id: r.id,
        document_id: r.documentId,
        filename: r.documentId ? filenameByDoc.get(r.documentId) : null,
        upload_id: r.uploadId,
        stage: r.stage,
        model: r.model,
        prompt_tokens: r.promptTokens,
        completion_tokens: r.completionTokens,
        cost_usd: parseFloat(r.costUsd ?? "0"),
        created_at: r.createdAt.toISOString(),
      })),
    };
  });

  app.patch<{ Body: { daily_budget_usd?: number } }>("/api/admin/observe", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    if (ctx.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
    const next = req.body?.daily_budget_usd;
    if (next == null || !Number.isFinite(next) || next < 0) {
      return reply.status(400).send({ error: "daily_budget_usd must be a non-negative number" });
    }
    const saved = await setDailyBudgetUsd(next);
    const status = await getLlmBudgetStatus();
    return { ...status, daily_budget_usd: parseFloat(saved) };
  });

  app.post("/api/admin/zoho/seed-org-ids", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    if (ctx.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
    const { seedKnownZohoOrgIds } = await import("./lib/zoho-org-sync.js");
    const result = await seedKnownZohoOrgIds(ctx.tenantId);
    return { ok: true, ...result };
  });

  app.post<{ Body: { clientId?: string } }>("/api/admin/zoho/sync-organizations", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    if (ctx.role !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
    const anchorClientId = req.body?.clientId?.trim();
    let tokenClientId = anchorClientId;
    if (!tokenClientId) {
      const [siddhi] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.tenantId, ctx.tenantId), eq(clients.gstin, "27FNZPP3642G1Z9")))
        .limit(1);
      tokenClientId = siddhi?.id;
    }
    if (!tokenClientId) {
      return reply.status(400).send({ error: "No client with OAuth tokens — connect Zoho first" });
    }
    const connected = await zohoTokenManager.isConnected(tokenClientId, ctx.tenantId);
    if (!connected) {
      return reply.status(400).send({
        error: "Zoho OAuth not connected for anchor client",
        clientId: tokenClientId,
        hint: `/integrations/zoho?clientId=${tokenClientId}`,
      });
    }
    const accessToken = await zohoTokenManager.getValidToken(tokenClientId, ctx.tenantId);
    const { syncZohoOrganizationsToClients } = await import("./lib/zoho-org-sync.js");
    const result = await syncZohoOrganizationsToClients(ctx.tenantId, accessToken);
    return { ok: true, ...result };
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

  // TIER 2: Multi-Channel Audit Enrichment
  app.get<{ Params: { clientId: string } }>(
    "/api/audit/capture-sources/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      // Get all documents for this client
      const docs = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, clientId)
          )
        );

      const uploadIds = docs
        .map((d) => d.uploadId)
        .filter((id): id is string => Boolean(id));
      const captureByUpload = await captureMetaByUploadIds(uploadIds);

      // Group by capture source
      const bySource = new Map<string, any[]>();
      for (const doc of docs) {
        if (!doc.uploadId) continue;
        const capture = captureByUpload.get(doc.uploadId);
        if (!capture) continue;

        const source = capture.capture_source || "unknown";
        if (!bySource.has(source)) {
          bySource.set(source, []);
        }
        bySource.get(source)!.push({
          document_id: doc.id,
          doc_number: doc.docNumber,
          uploaded_by: capture.uploaded_by,
          captured_at: capture.captured_at,
        });
      }

      const summary: any[] = [];
      for (const [source, items] of bySource.entries()) {
        summary.push({
          capture_source: source,
          count: items.length,
          documents: items,
        });
      }

      return { summary };
    }
  );

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

  // ─── TIER 2: Filing Deadline Tracker ──────────────────────────────────────

  app.get<{ Params: { clientId: string } }>(
    "/api/filing-deadlines/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { financial_year?: string };
      const { clientId } = req.params;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const whereConditions: any[] = [
        eq(filingDeadlines.tenantId, ctx.tenantId),
        eq(filingDeadlines.clientId, clientId),
      ];
      if (q.financial_year) {
        whereConditions.push(eq(filingDeadlines.financialYear, q.financial_year));
      }

      const deadlines = await db
        .select()
        .from(filingDeadlines)
        .where(and(...whereConditions))
        .orderBy(desc(filingDeadlines.dueDate));

      // Compute status based on due date
      const now = new Date();
      const enriched = deadlines.map((d) => ({
        ...d,
        daysUntilDue: Math.ceil(
          (d.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
        isOverdue: d.status === "overdue" || (d.dueDate < now && d.status === "pending"),
      }));

      return { deadlines: enriched };
    }
  );

  app.post<{
    Params: { clientId: string };
    Body: {
      financial_year: string;
      filing_type: "GSTR1" | "GSTR2B" | "GSTR3B";
      due_date: string; // ISO date or timestamp
      notes?: string;
    };
  }>(
    "/api/filing-deadlines/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const body = req.body ?? {};

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      // Validate input
      if (
        !body.financial_year ||
        !body.filing_type ||
        !body.due_date
      ) {
        return reply.status(400).send({
          error: "financial_year, filing_type, and due_date required",
        });
      }

      if (!["GSTR1", "GSTR2B", "GSTR3B"].includes(body.filing_type)) {
        return reply
          .status(400)
          .send({ error: "filing_type must be GSTR1, GSTR2B, or GSTR3B" });
      }

      const dueDate = new Date(body.due_date);
      if (isNaN(dueDate.getTime())) {
        return reply.status(400).send({ error: "Invalid due_date format" });
      }

      // Check if deadline already exists
      const [existing] = await db
        .select()
        .from(filingDeadlines)
        .where(
          and(
            eq(filingDeadlines.tenantId, ctx.tenantId),
            eq(filingDeadlines.clientId, clientId),
            eq(filingDeadlines.financialYear, body.financial_year),
            eq(filingDeadlines.filingType, body.filing_type as any)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing
        const [updated] = await db
          .update(filingDeadlines)
          .set({
            dueDate,
            notes: body.notes ?? existing.notes,
            updatedAt: new Date(),
          })
          .where(eq(filingDeadlines.id, existing.id))
          .returning();

        await audit(
          ctx,
          "filing_deadline.update",
          "filing_deadline",
          updated.id,
          { clientId, filingType: body.filing_type, fy: body.financial_year }
        );

        return updated;
      }

      // Create new
      const [row] = await db
        .insert(filingDeadlines)
        .values({
          tenantId: ctx.tenantId,
          clientId,
          financialYear: body.financial_year,
          filingType: body.filing_type as any,
          dueDate,
          status: "pending",
          notes: body.notes ?? "",
        })
        .returning();

      await audit(
        ctx,
        "filing_deadline.create",
        "filing_deadline",
        row.id,
        { clientId, filingType: body.filing_type, fy: body.financial_year }
      );

      return row;
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { status?: "pending" | "filed" | "overdue"; notes?: string };
  }>(
    "/api/filing-deadlines/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { id } = req.params;
      const body = req.body ?? {};

      // Verify deadline exists and user has access
      const [deadline] = await db
        .select()
        .from(filingDeadlines)
        .where(eq(filingDeadlines.id, id))
        .limit(1);
      if (!deadline) return reply.status(404).send({ error: "Not found" });

      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.id, deadline.clientId),
            eq(clients.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!client) return reply.status(403).send({ error: "Access denied" });

      const updateObj: Record<string, any> = { updatedAt: new Date() };
      if (body.status) {
        updateObj.status = body.status;
        if (body.status === "filed") {
          updateObj.filedDate = new Date();
        }
      }
      if (body.notes !== undefined) {
        updateObj.notes = body.notes;
      }

      const [updated] = await db
        .update(filingDeadlines)
        .set(updateObj)
        .where(eq(filingDeadlines.id, id))
        .returning();

      await audit(
        ctx,
        "filing_deadline.update",
        "filing_deadline",
        id,
        body
      );

      return updated;
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/filing-deadlines/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { id } = req.params;

      // Verify deadline exists and user has access
      const [deadline] = await db
        .select()
        .from(filingDeadlines)
        .where(eq(filingDeadlines.id, id))
        .limit(1);
      if (!deadline) return reply.status(404).send({ error: "Not found" });

      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.id, deadline.clientId),
            eq(clients.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!client) return reply.status(403).send({ error: "Access denied" });

      await db.delete(filingDeadlines).where(eq(filingDeadlines.id, id));

      await audit(
        ctx,
        "filing_deadline.delete",
        "filing_deadline",
        id
      );

      return { ok: true };
    }
  );

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

  // ─── TIER 2: ITC Reconciliation Alerts ────────────────────────────────────

  app.post<{
    Params: { clientId: string };
    Body: { financial_year: string; gstr2b_json: string };
  }>(
    "/api/reconciliation/compare/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const body = req.body ?? {};

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      if (!body.financial_year || !body.gstr2b_json) {
        return reply.status(400).send({
          error: "financial_year and gstr2b_json required",
        });
      }

      // Parse GSTR-2B JSON
      let gstr2bData: any;
      try {
        gstr2bData =
          typeof body.gstr2b_json === "string"
            ? JSON.parse(body.gstr2b_json)
            : body.gstr2b_json;
      } catch {
        return reply.status(400).send({ error: "Invalid gstr2b_json format" });
      }

      // Get all locked purchase invoices for the client and FY
      const purchInvoices = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, clientId),
            eq(gstDocuments.stage, "locked"),
            inArray(gstDocuments.docType, [
              "purchase_invoice",
              "debit_note_received",
              "credit_note_received",
            ])
          )
        );

      // Simple reconciliation: match invoice numbers
      const registerInvoices = new Map<string, typeof purchInvoices[0]>();
      for (const inv of purchInvoices) {
        if (inv.docNumber) {
          registerInvoices.set(inv.docNumber.toUpperCase(), inv);
        }
      }

      const gstr2bInvoices = gstr2bData.invoices || [];
      const mismatches: any[] = [];
      let matchedCount = 0;
      let mismatchedCount = 0;

      for (const gstr of gstr2bInvoices) {
        const key = (gstr.invoice_number || gstr.inv_num || "").toUpperCase();
        if (!key) continue;

        if (registerInvoices.has(key)) {
          matchedCount++;
        } else {
          mismatchedCount++;
          mismatches.push({
            gstr_invoice_number: key,
            party_name: gstr.supplier_name || gstr.party_name,
            party_gstin: gstr.supplier_gstin || gstr.party_gstin,
            gstr_taxable: gstr.taxable_value || 0,
            gstr_tax: gstr.total_tax || 0,
            reason: "Invoice in GSTR-2B but not in register",
          });
        }
      }

      // Check for invoices in register but not in GSTR-2B
      for (const [invNum, regInv] of registerInvoices.entries()) {
        const found = gstr2bInvoices.some(
          (g: any) =>
            (g.invoice_number || g.inv_num || "").toUpperCase() === invNum
        );
        if (!found) {
          mismatchedCount++;
          mismatches.push({
            register_invoice_number: invNum,
            party_name: (regInv.supplier as any)?.name || "",
            party_gstin: (regInv.supplier as any)?.gstin || "",
            register_taxable: parseFloat(regInv.taxableAmount ?? "0"),
            register_tax: parseFloat(regInv.igst ?? "0") +
              parseFloat(regInv.cgst ?? "0") +
              parseFloat(regInv.sgst ?? "0"),
            reason: "Invoice in register but not in GSTR-2B",
          });
        }
      }

      // Save snapshot
      const [snapshot] = await db
        .insert(itcReconciliationSnapshots)
        .values({
          tenantId: ctx.tenantId,
          clientId,
          financialYear: body.financial_year,
          gstr2bJson: body.gstr2b_json,
          matchedCount,
          mismatchedCount,
          reconciliationData: JSON.stringify({
            mismatches,
            summary: { matched: matchedCount, mismatched: mismatchedCount },
          }),
        })
        .returning();

      await audit(
        ctx,
        "reconciliation.compare",
        "reconciliation",
        snapshot.id,
        { clientId, fy: body.financial_year, mismatches: mismatchedCount }
      );

      return {
        id: snapshot.id,
        matched_count: matchedCount,
        mismatched_count: mismatchedCount,
        mismatches,
      };
    }
  );

  app.get<{ Params: { clientId: string } }>(
    "/api/reconciliation/snapshots/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { financial_year?: string };
      const { clientId } = req.params;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const whereConditions2: any[] = [
        eq(itcReconciliationSnapshots.tenantId, ctx.tenantId),
        eq(itcReconciliationSnapshots.clientId, clientId),
      ];
      if (q.financial_year) {
        whereConditions2.push(eq(itcReconciliationSnapshots.financialYear, q.financial_year));
      }

      const snapshots = await db
        .select()
        .from(itcReconciliationSnapshots)
        .where(and(...whereConditions2))
        .orderBy(desc(itcReconciliationSnapshots.createdAt));

      return {
        snapshots: snapshots.map((s) => ({
          id: s.id,
          financial_year: s.financialYear,
          matched_count: s.matchedCount,
          mismatched_count: s.mismatchedCount,
          reconciliation_data: s.reconciliationData
            ? JSON.parse(s.reconciliationData)
            : null,
          created_at: s.createdAt.toISOString(),
        })),
      };
    }
  );

  // ─── TIER 2: Tax Liability Dashboard ──────────────────────────────────────

  app.get<{ Params: { clientId: string } }>(
    "/api/tax-liability/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { financial_year?: string };
      const { clientId } = req.params;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      // Get all locked documents for the client
      const docs = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, clientId),
            eq(gstDocuments.stage, "locked")
          )
        );

      // Filter by FY if provided
      const targetFy = q.financial_year || currentIndianFinancialYear();
      const filtered = q.financial_year
        ? docs.filter((d) => d.financialYear === targetFy)
        : docs;

      // Compute tax liability
      let totalPayable = 0;
      let totalItcAvailable = 0;

      for (const doc of filtered) {
        const isSales = ["sales_invoice", "debit_note_issued"].includes(
          doc.docType
        );

        if (isSales) {
          // Sales: add up tax
          totalPayable += parseFloat(doc.igst ?? "0");
          totalPayable += parseFloat(doc.cgst ?? "0");
          totalPayable += parseFloat(doc.sgst ?? "0");
        } else {
          // Purchase: ITC eligible invoices
          if (doc.itcEligible && !doc.reverseCharge) {
            totalItcAvailable += parseFloat(doc.igst ?? "0");
            totalItcAvailable += parseFloat(doc.cgst ?? "0");
            totalItcAvailable += parseFloat(doc.sgst ?? "0");
          }
        }
      }

      const taxDue = Math.max(0, totalPayable - totalItcAvailable);

      // Compute trends for past 5 FYs
      const trends: any[] = [];
      for (let i = 0; i < 5; i++) {
        const year = new Date().getFullYear() - i;
        const fy = `${year - 1}-${String(year).slice(-2)}`;
        const fyDocs = docs.filter((d) => d.financialYear === fy);

        let fyPayable = 0;
        let fyItc = 0;
        for (const doc of fyDocs) {
          const isSales = ["sales_invoice", "debit_note_issued"].includes(
            doc.docType
          );
          if (isSales) {
            fyPayable += parseFloat(doc.igst ?? "0");
            fyPayable += parseFloat(doc.cgst ?? "0");
            fyPayable += parseFloat(doc.sgst ?? "0");
          } else if (doc.itcEligible && !doc.reverseCharge) {
            fyItc += parseFloat(doc.igst ?? "0");
            fyItc += parseFloat(doc.cgst ?? "0");
            fyItc += parseFloat(doc.sgst ?? "0");
          }
        }

        trends.push({
          financial_year: fy,
          payable: fyPayable,
          itc_available: fyItc,
          tax_due: Math.max(0, fyPayable - fyItc),
        });
      }

      return {
        financial_year: targetFy,
        payable: totalPayable,
        itc_available: totalItcAvailable,
        tax_due: taxDue,
        is_refund_case: totalItcAvailable > totalPayable,
        trends: trends.reverse(),
      };
    }
  );

  // ─── TIER 2: Amendment Return Workflow ────────────────────────────────────

  app.post<{
    Params: { clientId: string };
    Body: {
      original_document_id: string;
      reason_code: string;
      changes_summary?: string;
      amendment_data: Record<string, unknown>;
    };
  }>(
    "/api/amendments/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const body = req.body ?? {};

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      if (!body.original_document_id || !body.reason_code || !body.amendment_data) {
        return reply.status(400).send({
          error: "original_document_id, reason_code, and amendment_data required",
        });
      }

      // Verify original document exists
      const [origDoc] = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.id, body.original_document_id),
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, clientId)
          )
        )
        .limit(1);

      if (!origDoc) {
        return reply.status(404).send({ error: "Original document not found" });
      }

      const [amendment] = await db
        .insert(amendmentDocuments)
        .values({
          tenantId: ctx.tenantId,
          clientId,
          originalDocumentId: body.original_document_id,
          reasonCode: body.reason_code,
          changesSummary: body.changes_summary ?? "",
          amendmentData: JSON.stringify(body.amendment_data),
          status: "draft",
        })
        .returning();

      await audit(
        ctx,
        "amendment.create",
        "amendment",
        amendment.id,
        {
          clientId,
          originalDocId: body.original_document_id,
          reasonCode: body.reason_code,
        }
      );

      return amendment;
    }
  );

  app.get<{ Params: { clientId: string } }>(
    "/api/amendments/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { status?: string };
      const { clientId } = req.params;

      // Verify client exists and user has access
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const whereConditions3: any[] = [
        eq(amendmentDocuments.tenantId, ctx.tenantId),
        eq(amendmentDocuments.clientId, clientId),
      ];
      if (q.status) {
        whereConditions3.push(eq(amendmentDocuments.status, q.status as any));
      }

      const amendments = await db
        .select()
        .from(amendmentDocuments)
        .where(and(...whereConditions3))
        .orderBy(desc(amendmentDocuments.createdAt));

      return {
        amendments: amendments.map((a) => ({
          ...a,
          amendment_data: JSON.parse(a.amendmentData),
        })),
      };
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { status?: "draft" | "filed"; changes_summary?: string };
  }>(
    "/api/amendments/:id",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { id } = req.params;
      const body = req.body ?? {};

      // Verify amendment exists and user has access
      const [amendment] = await db
        .select()
        .from(amendmentDocuments)
        .where(eq(amendmentDocuments.id, id))
        .limit(1);
      if (!amendment) return reply.status(404).send({ error: "Not found" });

      const [client] = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.id, amendment.clientId),
            eq(clients.tenantId, ctx.tenantId)
          )
        )
        .limit(1);
      if (!client) return reply.status(403).send({ error: "Access denied" });

      const updateObj: Record<string, any> = { updatedAt: new Date() };
      if (body.status) {
        updateObj.status = body.status;
        if (body.status === "filed") {
          updateObj.filedDate = new Date();
        }
      }
      if (body.changes_summary !== undefined) {
        updateObj.changesSummary = body.changes_summary;
      }

      const [updated] = await db
        .update(amendmentDocuments)
        .set(updateObj)
        .where(eq(amendmentDocuments.id, id))
        .returning();

      await audit(ctx, "amendment.update", "amendment", id, body);

      return updated;
    }
  );

  // ─── TIER 3: Zoho Books Integration ───────────────────────────────────────

  app.get<{ Querystring: { clientId: string } }>(
    "/api/oauth/zoho",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const clientId = req.query.clientId;
      if (!clientId) return reply.status(400).send({ error: "clientId required" });

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(403).send({ error: "Forbidden" });

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      const zohoClientId = tenant?.zohoClientId ?? process.env.ZOHO_CLIENT_ID;
      if (!zohoClientId) return reply.status(400).send({ error: "Zoho OAuth not configured" });

      const redirectUri =
        process.env.ZOHO_OAUTH_REDIRECT_URI ??
        `${process.env.API_PUBLIC_URL ?? "http://localhost:3000"}/api/oauth/zoho/callback`;
      const state = createOAuthState(reply);
      reply.setCookie("zoho_oauth_client_id", clientId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 600,
      });
      const scopes = [
        "ZohoBooks.fullaccess.all",
        "ZohoBooks.contacts.CREATE",
        "ZohoBooks.invoices.CREATE",
      ].join(",");
      const url = new URL("https://accounts.zoho.in/oauth/v2/auth");
      url.searchParams.set("scope", scopes);
      url.searchParams.set("client_id", zohoClientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return reply.redirect(url.toString());
    }
  );

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/api/oauth/zoho/callback",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { code, state } = req.query;
      if (!code || !state) return reply.status(400).send({ error: "Missing code or state" });
      if (!verifyOAuthState(req, reply)) {
        return reply.status(403).send({ error: "Invalid OAuth state" });
      }
      const clientId = req.cookies.zoho_oauth_client_id;
      reply.clearCookie("zoho_oauth_client_id", { path: "/" });
      if (!clientId) return reply.status(400).send({ error: "Missing client context" });

      const redirectUri =
        process.env.ZOHO_OAUTH_REDIRECT_URI ??
        `${process.env.API_PUBLIC_URL ?? "http://localhost:3000"}/api/oauth/zoho/callback`;

      const tokens = await zohoTokenManager.exchangeCodeForTokens(code, ctx.tenantId, redirectUri);
      const [clientRow] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      const orgId =
        clientRow?.zohoBooksOrgId ??
        tenant?.zohoOrgId ??
        process.env.ZOHO_ORG_ID ??
        "";
      await zohoTokenManager.storeTokens(clientId, ctx.tenantId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        orgId,
      });

      try {
        const { syncZohoOrganizationsToClients, propagateZohoTokensToTenantClients } =
          await import("./lib/zoho-org-sync.js");
        const syncResult = await syncZohoOrganizationsToClients(ctx.tenantId, tokens.accessToken);
        const propagated = await propagateZohoTokensToTenantClients(ctx.tenantId, clientId);
        req.log.info({ syncResult, propagated }, "Zoho org → client sync after OAuth");
      } catch (syncErr) {
        req.log.warn({ err: syncErr }, "Zoho org sync after OAuth failed (OAuth still connected)");
      }

      const webBase = process.env.WEB_PUBLIC_URL ?? "http://localhost:5173";
      return reply.redirect(
        `${webBase}/integrations/zoho?clientId=${clientId}&connected=true`
      );
    }
  );

  app.delete<{ Params: { clientId: string } }>(
    "/api/integrations/zoho/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(403).send({ error: "Forbidden" });

      await zohoTokenManager.revokeTokens(clientId, ctx.tenantId);
      await db
        .update(gstDocuments)
        .set({ zohoSyncStatus: "not_configured", updatedAt: new Date() })
        .where(
          and(
            eq(gstDocuments.clientId, clientId),
            eq(gstDocuments.tenantId, ctx.tenantId),
            inArray(gstDocuments.zohoSyncStatus, ["pending", "error"])
          )
        );
      return { ok: true };
    }
  );

  app.post<{
    Params: { clientId: string };
    Body: { api_key: string; org_id: string };
  }>(
    "/api/integrations/zoho/connect/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const body = req.body ?? {};

      // Verify client exists
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      if (!body.api_key || !body.org_id) {
        return reply.status(400).send({ error: "api_key and org_id required" });
      }

      const result = await initializeZohoSync(ctx.tenantId, clientId, body.api_key as string, body.org_id as string);
      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      await audit(ctx, "zoho.connect", "integration", result.configId as string, { clientId });

      return { success: true, config_id: result.configId };
    }
  );

  app.post<{ Params: { clientId: string } }>(
    "/api/integrations/zoho/sync/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const pending = await db
        .select({ id: gstDocuments.id })
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.clientId, clientId),
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.stage, "locked"),
            inArray(gstDocuments.zohoSyncStatus, ["pending", "error"])
          )
        );

      for (const row of pending) {
        await enqueueZohoPush({ docId: row.id, tenantId: ctx.tenantId, clientId });
      }

      await audit(ctx, "zoho.sync", "integration", clientId, { queued: pending.length });
      return { queued: pending.length };
    }
  );

  app.get<{ Params: { clientId: string } }>(
    "/api/integrations/zoho/status/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const [config] = await db
        .select()
        .from(zohoSyncConfig)
        .where(and(eq(zohoSyncConfig.tenantId, ctx.tenantId), eq(zohoSyncConfig.clientId, clientId)))
        .limit(1);

      const counts = await db
        .select({
          status: gstDocuments.zohoSyncStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(gstDocuments)
        .where(and(eq(gstDocuments.clientId, clientId), eq(gstDocuments.tenantId, ctx.tenantId)))
        .groupBy(gstDocuments.zohoSyncStatus);

      const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]));
      const connected = await zohoTokenManager.isConnected(clientId, ctx.tenantId);

      const [lastLog] = await db
        .select({ createdAt: zohoSyncLog.createdAt })
        .from(zohoSyncLog)
        .where(and(eq(zohoSyncLog.tenantId, ctx.tenantId), eq(zohoSyncLog.clientId, clientId)))
        .orderBy(desc(zohoSyncLog.createdAt))
        .limit(1);

      return {
        connected,
        orgName: config?.zohoBooksOrgId ?? config?.zohoOrgId,
        synced: byStatus.synced ?? 0,
        pending: (byStatus.pending ?? 0) + (byStatus.syncing ?? 0),
        errors: byStatus.error ?? 0,
        lastSyncAt: lastLog?.createdAt?.toISOString() ?? config?.lastSyncAt?.toISOString(),
        configured: !!config?.isActive,
      };
    }
  );

  app.get<{
    Params: { clientId: string };
    Querystring: { status?: string; docId?: string; limit?: string; offset?: string };
  }>("/api/integrations/zoho/log/:clientId", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const { clientId } = req.params;
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
    const offset = parseInt(req.query.offset ?? "0", 10);

    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
      .limit(1);
    if (!client) return reply.status(403).send({ error: "Forbidden" });

    const conditions = [
      eq(zohoSyncLog.tenantId, ctx.tenantId),
      eq(zohoSyncLog.clientId, clientId),
    ];
    if (req.query.status) conditions.push(eq(zohoSyncLog.status, req.query.status as any));
    if (req.query.docId) conditions.push(eq(zohoSyncLog.docId, req.query.docId));

    const rows = await db
      .select()
      .from(zohoSyncLog)
      .where(and(...conditions))
      .orderBy(desc(zohoSyncLog.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(zohoSyncLog)
      .where(and(...conditions));

    return { rows, total };
  });

  app.post("/api/integrations/zoho/reconcile", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, ctx.userId), eq(memberships.tenantId, ctx.tenantId)))
      .limit(1);
    if (membership?.role !== "admin") {
      return reply.status(403).send({ error: "Admin only" });
    }
    await getZohoReconcileQueue().add("reconcile", {}, { jobId: `manual-reconcile-${Date.now()}` });
    return { triggered: true };
  });

  app.get<{ Querystring: { q?: string; type?: string; rate?: string; limit?: string } }>(
    "/api/masters/hsn-sac/search",
    async (req) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query.q?.trim() ?? "";
      const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 50);
      if (!q) return { results: [] };
      const results = await hsnValidator.suggest(q, ctx.tenantId, limit);
      const filtered = req.query.type
        ? results.filter((r) => r.type === req.query.type)
        : results;
      const rateFiltered = req.query.rate
        ? filtered.filter((r) => r.gstRate === req.query.rate)
        : filtered;
      return { results: rateFiltered };
    }
  );

  app.get("/api/billing/plans", async () => {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true));
    return { plans };
  });

  app.get("/api/billing/subscription", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const [sub] = await db
      .select()
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, ctx.tenantId))
      .limit(1);
    if (!sub) return reply.status(404).send({ error: "No subscription" });
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, sub.planId))
      .limit(1);
    return { plan, status: sub.status, trialEnd: sub.trialEnd, periodEnd: sub.currentPeriodEnd };
  });

  // Legacy API-key connect (kept for backward compatibility)
  app.post<{
    Params: { clientId: string };
    Body: { portal_token: string; refresh_token?: string };
  }>(
    "/api/integrations/gst-portal/connect/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const { clientId } = req.params;
      const body = req.body ?? {};

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });
      if (!client.gstin) return reply.status(400).send({ error: "Client GSTIN not set" });

      if (!body.portal_token) {
        return reply.status(400).send({ error: "portal_token required" });
      }

      const result = await initializeGstPortalSync(
        ctx.tenantId,
        clientId,
        client.gstin as string,
        body.portal_token as string
      );

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      await audit(ctx, "gst-portal.connect", "integration", result.configId as string, { clientId });

      return { success: true, config_id: result.configId };
    }
  );

  app.get<{ Params: { clientId: string } }>(
    "/api/integrations/gst-portal/gstr/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { type?: "gstr1" | "gstr2b"; fy?: string };
      const { clientId } = req.params;

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const fy = q.fy || currentIndianFinancialYear();
      const gstrType = q.type || "gstr2b";

      const result =
        gstrType === "gstr1"
          ? await fetchGstr1FromPortal(ctx.tenantId, clientId, fy)
          : await fetchGstr2bFromPortal(ctx.tenantId, clientId, fy);

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      await audit(ctx, `gst-portal.fetch-${gstrType}`, "integration", clientId, { fy });

      return { success: true, data: result.data };
    }
  );

  // ─── TIER 3: Email Forwarding Integration ────────────────────────────────

  app.post("/api/integrations/email/setup", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;

    // Check if already configured
    const [existing] = await db
      .select()
      .from(emailForwardConfig)
      .where(eq(emailForwardConfig.tenantId, ctx.tenantId))
      .limit(1);

    if (existing) {
      return {
        configured: true,
        forward_address: existing.uniqueForwardAddress,
        config_id: existing.id,
      };
    }

    const result = await initializeEmailForwarding(ctx.tenantId);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    await audit(ctx, "email-forward.setup", "integration", result.forwardAddress as string, {});

    return {
      configured: true,
      forward_address: result.forwardAddress,
      config_id: result.forwardAddress,
    };
  });

  app.get("/api/integrations/email/config", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;

    const [config] = await db
      .select()
      .from(emailForwardConfig)
      .where(eq(emailForwardConfig.tenantId, ctx.tenantId))
      .limit(1);

    if (!config) {
      return reply.status(404).send({ error: "Email forwarding not configured" });
    }

    return {
      forward_address: config.uniqueForwardAddress,
      parse_rules: config.parseRules,
      client_mappings: config.clientMappings,
      is_active: config.isActive,
    };
  });

  // ─── TIER 3: Expense Category Tagging ────────────────────────────────────

  app.get("/api/categories", async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;

    const categories = await db
      .select()
      .from(categoryMaster)
      .where(eq(categoryMaster.tenantId, ctx.tenantId));

    return {
      categories: categories.map((c) => ({
        code: c.code,
        name: c.name,
        account_code: c.accountCode,
        is_system: c.isSystemCategory,
      })),
    };
  });

  app.post<{ Body: { code: string; name: string; account_code?: string } }>(
    "/api/categories",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const body = req.body ?? {};

      if (!body.code || !body.name) {
        return reply.status(400).send({ error: "code and name required" });
      }

      try {
        const [category] = await db
          .insert(categoryMaster)
          .values({
            tenantId: ctx.tenantId,
            code: body.code,
            name: body.name,
            accountCode: body.account_code,
            isSystemCategory: false,
          })
          .returning();

        await audit(ctx, "category.create", "category", category.code, body);

        return category;
      } catch (error) {
        return reply.status(400).send({ error: "Failed to create category" });
      }
    }
  );

  app.post<{
    Body: { document_id: string; line_seq: number; category_code: string };
  }>(
    "/api/line-items/assign-category",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const body = req.body ?? {};

      if (!body.document_id || !body.line_seq || !body.category_code) {
        return reply.status(400).send({ error: "document_id, line_seq, and category_code required" });
      }

      const result = await assignCategoryToLineItem(
        body.document_id,
        body.line_seq,
        body.category_code
      );

      if (!result.success) {
        return reply.status(400).send({ error: result.error });
      }

      await audit(ctx, "line-item.assign-category", "line-item", body.document_id, body);

      return { success: true };
    }
  );

  app.get<{ Querystring: { hsn_code?: string; description?: string } }>(
    "/api/categories/suggest",
    async (req, reply) => {
      const q = req.query as { hsn_code?: string; description?: string };

      const suggestion = await autoSuggestCategory(q.hsn_code || "", q.description || "");

      return {
        suggested_code: suggestion.suggestedCode,
        suggested_name: suggestion.suggestedName,
      };
    }
  );

  // ─── TIER 3: TallyPrime Export ────────────────────────────────────────────

  app.get<{ Params: { clientId: string } }>(
    "/api/export/tally-prime/:clientId",
    async (req, reply) => {
      const ctx = (req as unknown as { auth: AuthContext }).auth;
      const q = req.query as { kind?: "sales" | "purchase"; fy?: string };
      const { clientId } = req.params;

      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId)))
        .limit(1);
      if (!client) return reply.status(404).send({ error: "Client not found" });

      const fy = q.fy || currentIndianFinancialYear();
      const kind = q.kind || "purchase";

      // Get all locked documents
      const docs = await db
        .select()
        .from(gstDocuments)
        .where(
          and(
            eq(gstDocuments.tenantId, ctx.tenantId),
            eq(gstDocuments.clientId, clientId),
            eq(gstDocuments.stage, "locked"),
            eq(gstDocuments.financialYear, fy)
          )
        );

      // Filter by document type
      const filtered =
        kind === "sales"
          ? docs.filter((d) => ["sales_invoice", "debit_note_issued"].includes(d.docType))
          : docs.filter((d) => ["purchase_invoice", "debit_note_received"].includes(d.docType));

      // Generate CSV for TallyPrime
      const csvLines: string[] = [
        "Date,Reference,Account,Debit,Credit,Narration",
      ];

      for (const doc of filtered) {
        // Map GST accounts from client config or defaults
        const gstAccounts = {
          sgst: "SGST Payable",
          cgst: "CGST Payable",
          igst: "IGST Payable",
        };

        csvLines.push(
          `${doc.docDate},"${doc.docNumber}","${gstAccounts.sgst}",${doc.sgst || 0},,SGST on ${doc.docNumber}`
        );
        csvLines.push(
          `${doc.docDate},"${doc.docNumber}","${gstAccounts.cgst}",${doc.cgst || 0},,CGST on ${doc.docNumber}`
        );
        csvLines.push(
          `${doc.docDate},"${doc.docNumber}","${gstAccounts.igst}",${doc.igst || 0},,IGST on ${doc.docNumber}`
        );

        // Reverse charge handling
        if (doc.reverseCharge) {
          csvLines.push(
            `${doc.docDate},"${doc.docNumber}","Reverse Charge Payable",${parseFloat(doc.igst || "0") + parseFloat(doc.cgst || "0") + parseFloat(doc.sgst || "0")},,RC on ${doc.docNumber}`
          );
        }
      }

      const csv = csvLines.join("\n");

      reply.header("Content-Type", "text/csv");
      reply.header(
        "Content-Disposition",
        `attachment; filename="tally_prime_${kind}_${client.gstin}_${fy}.csv"`
      );

      await audit(ctx, "export.tally-prime", "export", clientId, { kind, fy, count: filtered.length });

      return csv;
    }
  );

  return app;
}

const port = parseInt(process.env.API_PORT ?? "4000", 10);

async function cleanExpiredSessions() {
  try {
    await db.delete(authSessions).where(lt(authSessions.expires, new Date()));
  } catch (err) {
    console.warn("[auth] Failed to clean expired sessions:", err);
  }
}

export async function startServer() {
  const app = await buildApp();
  await app.listen({ port, host: "0.0.0.0" });

  // Clean up expired sessions on startup and every 24 hours to prevent DB bloat
  cleanExpiredSessions();
  setInterval(cleanExpiredSessions, 24 * 60 * 60 * 1000);

  return app;
}

if (!process.env.VITEST) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
