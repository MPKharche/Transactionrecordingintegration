import { defineConfig } from "drizzle-kit";

/** Load tables directly — schema/index.ts uses .js suffixes for NodeNext runtime. */
export default defineConfig({
  schema: [
    "./src/schema/tenants.ts",
    "./src/schema/documents.ts",
    "./src/schema/gst.ts",
    "./src/schema/sales-invoices.ts",
    "./src/schema/purchase-bills.ts",
    "./src/schema/coa.ts",
    "./src/schema/audit.ts",
    "./src/schema/masters.ts",
    "./src/schema/llm-budget.ts",
  ],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
