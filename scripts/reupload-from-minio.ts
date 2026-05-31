/**
 * Re-upload a document's bytes from MinIO (dev). Usage:
 *   pnpm exec tsx scripts/reupload-from-minio.ts <sourceDocId>
 */
import { createWriteStream } from "fs";
import { mkdir, readFile, rm } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";

const sourceDocId = process.argv[2];
if (!sourceDocId) {
  console.error("usage: reupload-from-minio.ts <gst-document-id>");
  process.exit(1);
}

async function downloadFromMinio(storagePath: string, dest: string) {
  const { getMinio, BUCKET } = await import("../apps/api/src/lib/minio.js");
  await mkdir(path.dirname(dest), { recursive: true });
  const stream = await getMinio().getObject(BUCKET, storagePath);
  await pipeline(stream, createWriteStream(dest));
}

async function main() {
  process.env.AUTH_DEV_BYPASS = "true";
  process.env.VITEST = "true";
  const { buildApp } = await import("../apps/api/src/index.js");
  const app = await buildApp();
  await app.ready();
  const login = await app.inject({ method: "POST", url: "/api/auth/dev-login", payload: {} });
  const { tenantId, userId } = login.json() as { tenantId: string; userId: string };
  const headers = { "x-tenant-id": tenantId, "x-user-id": userId };

  const get = await app.inject({
    method: "GET",
    url: `/api/documents/${sourceDocId}`,
    headers,
  });
  if (get.statusCode !== 200) throw new Error(`Document not found: ${sourceDocId}`);
  const row = get.json() as {
    id: string;
    stage: string;
    filename: string;
    client_id: string;
    doc_type: string;
    financial_year?: string;
    storage_path: string;
  };

  const storagePath = row.storage_path;
  console.log("source", {
    id: row.id,
    stage: row.stage,
    filename: row.filename,
    storagePath,
    clientId: row.client_id,
    fy: row.financial_year,
  });

  const tmp = path.join(process.cwd(), "test-results", `reupload-${Date.now()}.pdf`);
  await downloadFromMinio(storagePath, tmp);
  const buf = await readFile(tmp);
  console.log("downloaded bytes", buf.length);

  const boundary = "----reupload-minio";
  const preamble = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="client_id"',
      "",
      row.client_id,
      `--${boundary}`,
      'Content-Disposition: form-data; name="doc_type"',
      "",
      row.doc_type,
      `--${boundary}`,
      'Content-Disposition: form-data; name="financial_year"',
      "",
      row.financial_year ?? "2026-27",
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${row.filename}"`,
      "Content-Type: application/pdf",
      "",
    ].join("\r\n") + "\r\n",
    "utf8"
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([preamble, buf, closing]);

  const upload = await app.inject({
    method: "POST",
    url: "/api/documents/upload",
    headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  console.log("upload", upload.statusCode, upload.body);
  if (upload.statusCode !== 200) {
    await app.close();
    process.exit(1);
  }

  const newId = (upload.json() as { id: string }).id;
  console.log("new document id", newId);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const health = await app.inject({ method: "GET", url: "/api/health" });
    const pipeline = (health.json() as { pipeline?: { active: number; failed: number } }).pipeline;
    const get = await app.inject({ method: "GET", url: `/api/documents/${newId}`, headers });
    const d = get.json() as {
      stage: string;
      doc_number: string;
      doc_date: string;
      extraction_method: string;
      supplier: { gstin: string; name: string };
      issues: { field: string; message: string; severity: string }[];
      segment_index?: number;
      invoice_label?: string;
    };
    const siblings = await app.inject({
      method: "GET",
      url: "/api/documents",
      headers,
    });
    const all = (siblings.json() as { id: string; upload_id?: string }[]).filter(
      (x) => x.id === newId || (upload.json() as { upload_id?: string }).upload_id === undefined
    );
    console.log(`poll ${i + 1}`, {
      stage: d.stage,
      doc_number: d.doc_number,
      doc_date: d.doc_date,
      extraction_method: d.extraction_method,
      supplier_gstin: d.supplier?.gstin,
      supplier_name: d.supplier?.name?.slice(0, 50),
      issue_count: d.issues?.length ?? 0,
      pipeline,
      invoice_label: d.invoice_label,
    });
    if (d.stage === "ready_for_review" && d.doc_number && d.supplier?.gstin) break;
    if (d.stage === "failed" || d.stage === "rejected") break;
  }

  const final = await app.inject({ method: "GET", url: `/api/documents/${newId}`, headers });
  console.log("final", JSON.stringify(final.json(), null, 2).slice(0, 2000));
  await app.close();
  await rm(tmp, { force: true }).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
