#!/usr/bin/env node
/**
 * Set or rotate a user's password hash (for short-term password login testing).
 * Usage: node scripts/set-user-password.mjs user@example.com 'YourSecurePassword'
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/set-user-password.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const { setUserPasswordHash } = await import("../apps/api/src/lib/password-auth.ts");
await setUserPasswordHash(email, password);
console.log(`✓ Password hash updated for ${email}`);
