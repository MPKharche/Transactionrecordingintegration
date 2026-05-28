import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

if (!process.env.DATABASE_URL) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(here, "../../../.env") });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const poolMax = (() => {
  const raw = process.env.DATABASE_POOL_MAX;
  if (!raw) return 20;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
})();

const client = postgres(connectionString, { max: poolMax, idle_timeout: 20 });
export const db = drizzle(client, { schema });
export type DB = typeof db;
