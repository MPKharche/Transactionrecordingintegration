/** Retry pipeline for one GST document id (dev). Usage: pnpm exec tsx scripts/retry-document.ts <docId> */
const docId = process.argv[2];
if (!docId) {
  console.error("usage: retry-document.ts <document-id>");
  process.exit(1);
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
  const retry = await app.inject({
    method: "POST",
    url: `/api/documents/${docId}/retry`,
    headers,
    payload: {},
  });
  console.log("retry", retry.statusCode, retry.body);
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const get = await app.inject({ method: "GET", url: `/api/documents/${docId}`, headers });
    if (get.statusCode !== 200) continue;
    const d = get.json() as {
      stage: string;
      doc_number: string;
      doc_date: string;
      extraction_method: string;
      supplier: { gstin: string; name: string };
      issues: { field: string; message: string }[];
    };
    console.log("poll", {
      stage: d.stage,
      doc_number: d.doc_number,
      doc_date: d.doc_date,
      extraction_method: d.extraction_method,
      supplier_gstin: d.supplier?.gstin,
      supplier_name: d.supplier?.name?.slice(0, 40),
    });
    if (d.doc_number && d.supplier?.gstin) break;
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
