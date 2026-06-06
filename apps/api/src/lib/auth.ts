import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@ca-suite/db/client";
import { authSessions, memberships, users } from "@ca-suite/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { assertEmailAllowed } from "./access-control.js";

export type AuthContext = {
  tenantId: string;
  userId: string;
  email: string;
  name?: string;
  role: "admin" | "manager" | "operator";
};

const SESSION_COOKIE = "ca_session";
const OAUTH_STATE_COOKIE = "ca_oauth_state";
const SESSION_DAYS = 7;

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function devAuthAllowed() {
  return (
    process.env.AUTH_DEV_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function createSession(userId: string, reply: FastifyReply) {
  const token = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({ sessionToken: token, userId, expires });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return token;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.sessionToken, token));
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function resolveAuth(
  req: FastifyRequest
): Promise<AuthContext | null> {
  if (devAuthAllowed()) {
    const tenantId = String(req.headers["x-tenant-id"] ?? "");
    const userId = String(req.headers["x-user-id"] ?? "");
    if (tenantId && userId) {
      return { tenantId, userId, email: "dev@local", name: "Dev User", role: "admin" };
    }
  }

  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;

  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(eq(authSessions.sessionToken, token), gt(authSessions.expires, new Date()))
    )
    .limit(1);
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return null;

  try {
    assertEmailAllowed(user.email);
  } catch {
    return null;
  }

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);
  if (!membership) return null;

  return {
    tenantId: membership.tenantId,
    userId: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role: membership.role,
  };
}

export function createOAuthState(reply: FastifyReply) {
  const state = randomBytes(24).toString("hex");
  reply.setCookie(OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });
  return state;
}

export function verifyOAuthState(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = req.cookies[OAUTH_STATE_COOKIE];
  const got = (req.query as { state?: string }).state;
  reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  return Boolean(expected && got && expected === got);
}

type ZohoOAuthStatePayload = {
  p: "zoho";
  clientId: string;
  tenantId: string;
  userId: string;
  exp: number;
};

function oauthStateSecret() {
  return process.env.AUTH_SECRET ?? "dev-insecure-oauth-state";
}

/** Signed state survives cross-domain OAuth (Vercel UI → VPS callback). */
export function createZohoOAuthState(ctx: AuthContext, clientId: string): string {
  const payload: ZohoOAuthStatePayload = {
    p: "zoho",
    clientId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", oauthStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyZohoOAuthState(state: string): ZohoOAuthStatePayload | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", oauthStateSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as ZohoOAuthStatePayload;
    if (payload.p !== "zoho" || payload.exp < Date.now()) return null;
    if (!payload.clientId || !payload.tenantId || !payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function zohoRedirectUri(req?: FastifyRequest): string {
  if (process.env.ZOHO_OAUTH_REDIRECT_URI) {
    return process.env.ZOHO_OAUTH_REDIRECT_URI.replace(/\/$/, "");
  }
  const forwardedHost = req?.headers["x-forwarded-host"];
  const forwardedProto = String(req?.headers["x-forwarded-proto"] ?? "https");
  if (forwardedHost) {
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    return `${forwardedProto}://${host}/api/oauth/zoho/callback`;
  }
  if (process.env.WEB_ORIGIN) {
    return `${process.env.WEB_ORIGIN.replace(/\/$/, "")}/api/oauth/zoho/callback`;
  }
  const apiBase = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  return `${apiBase.replace(/\/$/, "")}/api/oauth/zoho/callback`;
}

export function googleRedirectUri(req?: FastifyRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI.replace(/\/$/, "");
  }
  const forwardedHost = req?.headers["x-forwarded-host"];
  const forwardedProto = String(req?.headers["x-forwarded-proto"] ?? "https");
  if (forwardedHost) {
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    return `${forwardedProto}://${host}/api/auth/google/callback`;
  }
  if (process.env.WEB_ORIGIN) {
    return `${process.env.WEB_ORIGIN.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  const apiBase = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  return `${apiBase.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(redirectUri: string, state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ email: string; name: string; picture?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${t}`);
  }
  const tokens = (await tokenRes.json()) as { access_token: string };

  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  );
  if (!profileRes.ok) throw new Error("Failed to fetch Google profile");
  const profile = (await profileRes.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };
  if (!profile.email) throw new Error("Google account has no email");
  return {
    email: profile.email.toLowerCase(),
    name: profile.name ?? profile.email,
    picture: profile.picture,
  };
}

export async function upsertUserFromGoogle(profile: {
  email: string;
  name: string;
  picture?: string;
}) {
  assertEmailAllowed(profile.email);

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: profile.email,
        name: profile.name,
        image: profile.picture,
        emailVerified: new Date(),
      })
      .returning();
  } else if (profile.picture && user.image !== profile.picture) {
    [user] = await db
      .update(users)
      .set({ name: profile.name, image: profile.picture })
      .where(eq(users.id, user.id))
      .returning();
  }

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!membership) {
    if (process.env.GOOGLE_ALLOW_AUTO_JOIN !== "true") {
      throw new Error("No practice membership for this email. Contact your admin.");
    }
    const { tenants } = await import("@ca-suite/db");
    let [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) {
      [tenant] = await db
        .insert(tenants)
        .values({ name: "Default Practice", slug: "default" })
        .returning();
    }
    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "operator",
    });
  }

  return user;
}
