import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@ca-suite/zoho-sync",
        replacement: path.resolve(__dirname, "packages/zoho-sync/src/index.ts"),
      },
      {
        find: "@ca-suite/db/llm-budget-service",
        replacement: path.resolve(__dirname, "packages/db/src/llm-budget-service.ts"),
      },
      {
        find: "@ca-suite/db/client",
        replacement: path.resolve(__dirname, "packages/db/src/client.ts"),
      },
      {
        // Exact match only — a plain "@ca-suite/db" prefix would swallow subpath exports.
        find: /^@ca-suite\/db$/,
        replacement: path.resolve(__dirname, "packages/db/src/index.ts"),
      },
      {
        find: "@ca-suite/shared/server",
        replacement: path.resolve(__dirname, "packages/shared/src/server.ts"),
      },
      {
        find: "@ca-suite/shared",
        replacement: path.resolve(__dirname, "packages/shared/src/index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "apps/web/src"),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    environmentMatchGlobs: [["tests/**/*.test.tsx", "happy-dom"]],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
