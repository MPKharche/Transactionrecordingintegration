import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import Redis from "ioredis";
import { eq } from "drizzle-orm";
import { db } from "@ca-suite/db/client";
import { users } from "@ca-suite/db";
import { assertEmailAllowed } from "./access-control.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }
  return redis;
}

export function passwordLoginEnabled(): boolean {
  if (process.env.AUTH_PASSWORD_LOGIN_ENABLED !== "true") return false;
  const until = process.env.AUTH_PASSWORD_LOGIN_UNTIL?.trim();
  if (!until) return true;
  const expiry = Date.parse(until);
  if (Number.isNaN(expiry)) return true;
  return Date.now() < expiry;
}

function rateWindowSec(): number {
  return parseInt(process.env.AUTH_LOGIN_RATE_WINDOW_SEC ?? "900", 10);
}

function maxAttempts(): number {
  return parseInt(process.env.AUTH_LOGIN_MAX_ATTEMPTS ?? "5", 10);
}

function lockoutSec(): number {
  return parseInt(process.env.AUTH_LOGIN_LOCKOUT_SEC ?? "1800", 10);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plaintext, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1] ?? "", 10);
  const r = parseInt(parts[2] ?? "", 10);
  const p = parseInt(parts[3] ?? "", 10);
  const salt = parts[4] ?? "";
  const expectedHex = parts[5] ?? "";
  if (!salt || !expectedHex) return false;
  const derived = scryptSync(plaintext, salt, KEY_LEN, { N, r, p });
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export class LoginRateLimitedError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("Too many login attempts. Try again later.");
    this.name = "LoginRateLimitedError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class LoginInvalidError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "LoginInvalidError";
  }
}

async function checkRateLimit(clientIp: string, email: string): Promise<void> {
  const windowSec = rateWindowSec();
  const limit = maxAttempts();
  const keys = [
    `auth:login:ip:${clientIp}`,
    `auth:login:email:${normalizeEmail(email)}`,
  ];

  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    for (const key of keys) {
      const locked = await r.get(`${key}:lock`);
      if (locked) {
        const ttl = await r.ttl(`${key}:lock`);
        throw new LoginRateLimitedError(Math.max(ttl, 1));
      }
      const count = parseInt((await r.get(key)) ?? "0", 10);
      if (count >= limit) {
        await r.setex(`${key}:lock`, lockoutSec(), "1");
        throw new LoginRateLimitedError(lockoutSec());
      }
    }
  } catch (err) {
    if (err instanceof LoginRateLimitedError) throw err;
    // Redis unavailable — still enforce minimum delay; skip distributed counter
  }
}

async function recordFailedAttempt(clientIp: string, email: string): Promise<void> {
  const windowSec = rateWindowSec();
  const keys = [
    `auth:login:ip:${clientIp}`,
    `auth:login:email:${normalizeEmail(email)}`,
  ];
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    for (const key of keys) {
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, windowSec);
      if (count >= maxAttempts()) {
        await r.setex(`${key}:lock`, lockoutSec(), "1");
      }
    }
  } catch {
    /* best-effort */
  }
}

async function clearRateLimit(clientIp: string, email: string): Promise<void> {
  const keys = [
    `auth:login:ip:${clientIp}`,
    `auth:login:email:${normalizeEmail(email)}`,
    `auth:login:ip:${clientIp}:lock`,
    `auth:login:email:${normalizeEmail(email)}:lock`,
  ];
  try {
    const r = getRedis();
    if (r.status !== "ready") await r.connect();
    if (keys.length) await r.del(...keys);
  } catch {
    /* best-effort */
  }
}

export async function setUserPasswordHash(email: string, plaintext: string): Promise<void> {
  const norm = normalizeEmail(email);
  const hash = hashPassword(plaintext);
  const updated = await db
    .update(users)
    .set({ passwordHash: hash, passwordUpdatedAt: new Date() })
    .where(eq(users.email, norm))
    .returning({ id: users.id });
  if (updated.length === 0) {
    throw new Error(`No user found for ${norm}`);
  }
}

export async function authenticateWithPassword(
  email: string,
  password: string,
  clientIp: string
): Promise<{ userId: string }> {
  if (!passwordLoginEnabled()) {
    throw new LoginInvalidError();
  }

  const norm = normalizeEmail(email);
  if (!norm || !password || password.length > 256) {
    throw new LoginInvalidError();
  }

  await checkRateLimit(clientIp, norm);

  try {
    assertEmailAllowed(norm);
  } catch {
    await recordFailedAttempt(clientIp, norm);
    await sleep(400 + Math.floor(Math.random() * 200));
    throw new LoginInvalidError();
  }

  const [user] = await db.select().from(users).where(eq(users.email, norm)).limit(1);
  const hash = user?.passwordHash;
  const ok = Boolean(hash && verifyPassword(password, hash));

  if (!ok) {
    await recordFailedAttempt(clientIp, norm);
    await sleep(400 + Math.floor(Math.random() * 200));
    throw new LoginInvalidError();
  }

  await clearRateLimit(clientIp, norm);
  return { userId: user!.id };
}
