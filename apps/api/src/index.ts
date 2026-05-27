import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { Queue } from "bullmq";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@ca-suite/db/client";
import {
  auditLog,
  clients,
  documentIssues,
  documentLines,
  gstDocuments,
  partyMaster,
  uploads,
  tenants,
  users,
  memberships,
} from "@ca-suite/db";
import { canLockDocument, isValidGSTIN, isValidPAN } from "@ca-suite/shared";
import { mapClient, mapDocument, lineToDb } from "./lib/mappers.js";
import { putObject, sha256, storagePath } from "./lib/minio.js";
import type { GSTDocument } from "@ca-suite/shared";
import {
  resolveAuth,
  createSession,
  destroySession,
  googleAuthUrl,
  exchangeGoogleCode,
  upsertUserFromGoogle,
  devAuthAllowed,
  createOAuthState,
  verifyOAuthState,
  type AuthContext,
} from "./lib/auth.js";

export type { AuthContext };

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

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
  return mapDocument(row, lines, issues);
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
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.addHook("preHandler", async (req, reply) => {
    const open =
      req.url.startsWith("/api/health") ||
      req.url.startsWith("/api/auth/google") ||
      req.url.startsWith("/api/auth/dev-login") ||
      req.url.startsWith("/api/auth/session") ||
      req.url.startsWith("/api/auth/logout");
    if (open) return;
    const ctx = await resolveAuth(req);
    if (!ctx) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    (req as { auth: AuthContext }).auth = ctx;
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "ca-suite-api",
    time: new Date().toISOString(),
  }));

  app.get("/api/auth/session", async (req, reply) => {
    try {
      const ctx = await resolveAuth(req);
      if (!ctx) return reply.status(401).send({ error: "Not signed in" });
      return {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        email: ctx.email,
        name: ctx.name,
      };
    } catch (err) {
      req.log.error(err);
      return reply.status(503).send({ error: "Auth unavailable — check database connection" });
    }
  });

  app.get("/api/auth/google", async (req, reply) => {
    const apiBase = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
    const redirectUri = `${apiBase}/api/auth/google/callback`;
    const state = createOAuthState(reply);
    return reply.redirect(googleAuthUrl(redirectUri, state));
  });

  app.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    "/api/auth/google/callback",
    async (req, reply) => {
      if (req.query.error) {
        return reply.redirect(`${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/login?error=oauth`);
      }
      if (!verifyOAuthState(req, reply)) {
        return reply.redirect(
          `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/login?error=oauth_state`
        );
      }
      const code = req.query.code;
      if (!code) {
        return reply.status(400).send({ error: "Missing code" });
      }
      const apiBase = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
      const redirectUri = `${apiBase}/api/auth/google/callback`;
      try {
        const profile = await exchangeGoogleCode(code, redirectUri);
        const user = await upsertUserFromGoogle(profile);
        await createSession(user.id, reply);
        return reply.redirect(process.env.WEB_ORIGIN ?? "http://localhost:5173");
      } catch {
        return reply.redirect(
          `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/login?error=oauth_failed`
        );
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
    const email = req.body?.email ?? "admin@ca-suite.local";
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
        .values({ name: "Demo Practice", slug: "demo-practice" })
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
    };
  });

  app.get("/api/clients", async (req) => {
    const { tenantId } = (req as { auth: AuthContext }).auth;
    const rows = await db
      .select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(clients.name);
    return rows.map(mapClient);
  });

  app.post<{ Body: Partial<Client> }>("/api/clients", async (req, reply) => {
    const { tenantId, userId } = (req as { auth: AuthContext }).auth;
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
        pan: b.pan,
        active: b.active ?? true,
        state: b.state,
        stateCode: b.state_code,
        address: b.address,
        mobile: b.mobile,
        email: b.email,
      })
      .returning();
    await audit(
      { tenantId, userId },
      "client.create",
      "client",
      row.id
    );
    return mapClient(row);
  });

  app.patch<{ Params: { id: string }; Body: Partial<Client> }>(
    "/api/clients/:id",
    async (req, reply) => {
      const ctx = (req as { auth: AuthContext }).auth;
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
          pan: b.pan ?? existing.pan,
          active: b.active ?? existing.active,
          state: b.state ?? existing.state,
          stateCode: b.state_code ?? existing.stateCode,
          address: b.address ?? existing.address,
          mobile: b.mobile ?? existing.mobile,
          email: b.email ?? existing.email,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, req.params.id))
        .returning();
      await audit(ctx, "client.update", "client", row.id, undefined, req);
      return mapClient(row);
    }
  );

  app.get("/api/parties", async (req) => {
    const { tenantId } = (req as { auth: AuthContext }).auth;
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

  app.get("/api/documents", async (req) => {
    const { tenantId } = (req as { auth: AuthContext }).auth;
    const q = req.query as { client_id?: string; stage?: string };
    let query = db
      .select()
      .from(gstDocuments)
      .where(eq(gstDocuments.tenantId, tenantId))
      .orderBy(desc(gstDocuments.updatedAt));
    const rows = await query;
    const filtered = rows.filter((r) => {
      if (q.client_id && r.clientId !== q.client_id) return false;
      if (q.stage && r.stage !== q.stage) return false;
      return true;
    });
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
    return filtered.map((row) =>
      mapDocument(
        row,
        (linesByDoc.get(row.id) ?? []).sort((a, b) => a.seq - b.seq),
        issuesByDoc.get(row.id) ?? []
      )
    );
  });

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (req, reply) => {
    const { tenantId } = (req as { auth: AuthContext }).auth;
    const doc = await loadDocument(req.params.id, tenantId);
    if (!doc) return reply.status(404).send({ error: "Not found" });
    return doc;
  });

  app.patch<{ Params: { id: string }; Body: Partial<GSTDocument> }>(
    "/api/documents/:id",
    async (req, reply) => {
      const ctx = (req as { auth: AuthContext }).auth;
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
      const b = req.body ?? {};
      await db
        .update(gstDocuments)
        .set({
          docNumber: b.doc_number ?? existing.docNumber,
          docDate: b.doc_date ?? existing.docDate,
          docType: (b.doc_type as typeof existing.docType) ?? existing.docType,
          supplier: (b.supplier as object) ?? existing.supplier,
          recipient: (b.recipient as object) ?? existing.recipient,
          supplyType: b.supply_type ?? existing.supplyType,
          reverseCharge: b.reverse_charge ?? existing.reverseCharge,
          placeOfSupply: b.place_of_supply ?? existing.placeOfSupply,
          taxableAmount: b.taxable_amount != null ? String(b.taxable_amount) : existing.taxableAmount,
          igst: b.igst != null ? String(b.igst) : existing.igst,
          cgst: b.cgst != null ? String(b.cgst) : existing.cgst,
          sgst: b.sgst != null ? String(b.sgst) : existing.sgst,
          cess: b.cess != null ? String(b.cess) : existing.cess,
          total: b.total != null ? String(b.total) : existing.total,
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, req.params.id));
      if (b.lines) await saveDocumentLines(req.params.id, b.lines);
      if (b.issues) await saveDocumentIssues(req.params.id, b.issues);
      await audit(ctx, "document.update", "document", req.params.id);
      const doc = await loadDocument(req.params.id, ctx.tenantId);
      return doc;
    }
  );

  app.post("/api/documents/upload", async (req, reply) => {
    const ctx = (req as { auth: AuthContext }).auth;
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "file required" });
    const clientIdField = data.fields.client_id;
    const clientId =
      typeof clientIdField === "object" && clientIdField && "value" in clientIdField
        ? String((clientIdField as { value: string }).value)
        : "";
    const docTypeField = data.fields.doc_type;
    const docType =
      typeof docTypeField === "object" && docTypeField && "value" in docTypeField
        ? String((docTypeField as { value: string }).value)
        : "purchase_invoice";
    const fyField = data.fields.financial_year;
    const fy =
      typeof fyField === "object" && fyField && "value" in fyField
        ? String((fyField as { value: string }).value)
        : "2024-25";

    if (!clientId) return reply.status(400).send({ error: "client_id required" });

    const [client] = await db
      .select()
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenantId))
      )
      .limit(1);
    if (!client) return reply.status(404).send({ error: "Client not found" });

    const buf = await data.toBuffer();
    const hash = sha256(buf);
    const dup = await db
      .select({ id: gstDocuments.id })
      .from(gstDocuments)
      .where(
        and(
          eq(gstDocuments.tenantId, ctx.tenantId),
          eq(gstDocuments.contentSha256, hash)
        )
      )
      .limit(1);
    if (dup.length > 0) {
      return reply.status(409).send({
        error: "Duplicate document",
        existingId: dup[0].id,
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
          docType === "sales_invoice"
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
      })
      .returning();

    const queue = new Queue("pipeline", { connection });
    const jobId = `${uploadRow.id}-normalize`;
    await queue.add(
      "normalize",
      { uploadId: uploadRow.id, tenantId: ctx.tenantId, stage: "normalize", gstDocumentId: docId },
      { jobId, deduplication: { id: jobId } }
    );

    await audit(ctx, "document.upload", "document", docId, { uploadId: uploadRow.id });
    return mapDocument(docRow, [], []);
  });

  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/lock",
    async (req, reply) => {
      const ctx = (req as { auth: AuthContext }).auth;
      const doc = await loadDocument(req.params.id, ctx.tenantId);
      if (!doc) return reply.status(404).send({ error: "Not found" });
      const check = canLockDocument(doc);
      if (!check.ok) return reply.status(400).send({ errors: check.errors });

      for (const p of [doc.supplier, doc.recipient]) {
        if (!p.gstin) continue;
        await db
          .insert(partyMaster)
          .values({
            gstin: p.gstin.toUpperCase(),
            tenantId: ctx.tenantId,
            name: p.name,
            pan: p.pan,
            address: p.address,
            city: p.city,
            state: p.state,
            stateCode: p.state_code,
            mobile: p.mobile,
            email: p.email,
            isRegistered: p.is_registered,
          })
          .onConflictDoUpdate({
            target: [partyMaster.tenantId, partyMaster.gstin],
            set: {
              name: p.name,
              pan: p.pan,
              address: p.address,
              city: p.city,
              state: p.state,
              stateCode: p.state_code,
              mobile: p.mobile,
              email: p.email,
              isRegistered: p.is_registered,
              lastSeen: new Date(),
            },
          });
      }

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
      const ctx = (req as { auth: AuthContext }).auth;
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

  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/retry",
    async (req, reply) => {
      const ctx = (req as { auth: AuthContext }).auth;
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
      const queue = new Queue("pipeline", { connection });
      const jobId = `${row.uploadId}-normalize`;
      await queue.add(
        "normalize",
        {
          uploadId: row.uploadId,
          tenantId: ctx.tenantId,
          stage: "normalize",
          gstDocumentId: row.id,
        },
        { jobId, deduplication: { id: jobId } }
      );
      await audit(ctx, "document.retry", "document", req.params.id);
      return loadDocument(req.params.id, ctx.tenantId);
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/documents/:id/preview-url",
    async (req, reply) => {
      const { tenantId } = (req as { auth: AuthContext }).auth;
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
      const { presignedGet } = await import("./lib/minio.js");
      const url = await presignedGet(row.storagePath);
      return { url };
    }
  );

  return app;
}

type Client = {
  name: string;
  gstin: string;
  pan?: string;
  active?: boolean;
  state?: string;
  state_code?: string;
  address?: string;
  mobile?: string;
  email?: string;
};

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
