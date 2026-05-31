import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createConnection } from "net";
import postgres from "postgres";
import fs from "fs";
import path from "path";

const dbUrl = process.env.DATABASE_URL ?? "postgresql://ca_user:ca_pass@localhost:5433/ca_saas";

function dbReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port: 5433, timeout: 2000 }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

const integrationEnabled = await dbReachable();

describe.skipIf(!integrationEnabled)("Database migrations", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    process.env.DATABASE_URL = dbUrl;
    sql = postgres(dbUrl, { max: 1 });
  });

  afterAll(async () => {
    await sql.end();
  });

  it("migration SQL files exist", () => {
    const dir = path.join(process.cwd(), "packages/db/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("core GST and auth tables exist after schema push", async () => {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    const names = new Set(tables.map((t) => t.tablename));
    for (const required of [
      "tenants",
      "users",
      "memberships",
      "auth_sessions",
      "clients",
      "gst_documents",
      "document_lines",
      "document_issues",
      "uploads",
      "party_master",
    ]) {
      expect(names.has(required), `missing table ${required}`).toBe(true);
    }
  });

  it("partial unique index on active gst document sha exists", async () => {
    const rows = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'gst_documents'
        AND indexname = 'gst_documents_tenant_sha_active_uidx'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/rejected/i);
    expect(rows[0].indexdef).toMatch(/segment_index/i);
  });

  it("core tables exist after schema push", async () => {
    const tables = await sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('tenants', 'users', 'clients', 'gst_documents')
      ORDER BY tablename
    `;
    expect(tables.map((t) => t.tablename)).toEqual([
      "clients",
      "gst_documents",
      "tenants",
      "users",
    ]);
  });
});
