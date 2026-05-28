import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@ca-suite/db/client",
        replacement: path.resolve(__dirname, "packages/db/src/client.ts"),
      },
      {
        find: "@ca-suite/db",
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
