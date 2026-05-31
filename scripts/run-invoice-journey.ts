/**
 * Upload a PDF through the full pipeline and print document outcomes.
 * Usage: pnpm exec tsx scripts/run-invoice-journey.ts "path/to/file.pdf"
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

const API = process.env.API_PUBLIC_URL ?? "http://127.0.0.1:4000";
const pdfPath = process.argv[2];
if (!pdfPath || !fs.existsSync(pdfPath)) {
  console.error("usage: tsx scripts/run-invoice-journey.ts <pdf-path>");
  process.exit(1);
}

type Client = { id: string; name: string; gstin: string };
type Doc = {
  id: string;
  stage: string;
  doc_number?: string;
  invoice_label?: string;
  supplier?: { name?: string; gstin?: string };
  recipient?: { name?: string; gstin?: string };
  issues?: { severity: string; message: string }[];
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const jar = new Map<string, string>();
  const store = (res: Response) => {
    const raw = res.headers.get("set-cookie");
    if (!raw) return;
    for (const part of raw.split(",")) {
      const m = part.match(/([^=]+)=([^;]+)/);
      if (m) jar.set(m[1].trim(), m[2].trim());
    }
  };
  const cookie = () =>
    Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

  async function api(method: string, urlPath: string, body?: unknown) {
    const res = await fetch(`${API}${urlPath}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie() ? { Cookie: cookie() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    store(res);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { res, json };
  }

  const login = await api("POST", "/api/auth/dev-login", {});
  if (!login.res.ok) throw new Error(`dev-login failed: ${login.res.status} ${JSON.stringify(login.json)}`);
  console.log("✓ dev-login");

  let clients = (await api("GET", "/api/clients")).json as Client[];
  let client = clients.find((c) => c.gstin === "27FNZPP3642G1Z9");
  if (!client) {
    const created = await api("POST", "/api/clients", {
      name: "Siddhivinayak Engineering & Contractor",
      gstin: "27FNZPP3642G1Z9",
      state: "Maharashtra",
      state_code: "27",
      active: true,
    });
    if (!created.res.ok) throw new Error(`create client failed: ${created.res.status} ${JSON.stringify(created.json)}`);
    client = created.json as Client;
    console.log("✓ created client", client.id);
  } else {
    console.log("✓ using client", client.id);
  }

  const buf = fs.readFileSync(pdfPath);
  const boundary = `----journey${Date.now()}`;
  const filename = path.basename(pdfPath);
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="client_id"\r\n\r\n${client!.id}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="doc_type"\r\n\r\npurchase_invoice\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="financial_year"\r\n\r\n2025-26\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
  ];
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(parts.join("")),
    buf,
    Buffer.from(tail),
  ]);

  const uploadRes = await fetch(`${API}/api/documents/upload`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      ...(cookie() ? { Cookie: cookie() } : {}),
    },
    body,
  });
  store(uploadRes);
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`upload failed: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  console.log("✓ upload enqueued", uploadJson);

  const deadline = Date.now() + 10 * 60_000;
  let docs: Doc[] = [];
  while (Date.now() < deadline) {
    await sleep(5000);
    const list = await api("GET", "/api/documents");
    docs = list.json as Doc[];
    const stages = docs.map((d) => `${d.invoice_label ?? d.id.slice(0, 8)}:${d.stage}`).join(", ");
    console.log(`… ${docs.length} doc(s) — ${stages}`);
    const pending = docs.filter(
      (d) => !["ready_for_review", "locked", "failed", "rejected"].includes(d.stage)
    );
    if (pending.length === 0 && docs.length > 0) break;
  }

  console.log("\n=== Final documents ===");
  for (const d of docs) {
    console.log({
      id: d.id,
      label: d.invoice_label,
      stage: d.stage,
      doc_number: d.doc_number,
      supplier: d.supplier,
      recipient: d.recipient,
      issues: d.issues?.length ?? 0,
    });
  }

  const ok = docs.filter((d) => d.stage === "ready_for_review");
  const failed = docs.filter((d) => d.stage === "failed");
  console.log(`\nSummary: ${ok.length} ready_for_review, ${failed.length} failed, ${docs.length} total`);
  if (ok.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
