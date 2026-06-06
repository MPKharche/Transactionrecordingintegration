import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { db } from "@ca-suite/db/client";
import { zohoSyncConfig, tenants } from "@ca-suite/db";
import { and, eq } from "drizzle-orm";
import { ZohoHttpError } from "./retry.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.ZOHO_TOKEN_ENCRYPTION_KEY;
  if (hex && hex.length === 64) {
    return Buffer.from(hex, "hex");
  }
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    return Buffer.alloc(32, 0xab);
  }
  throw new Error("ZOHO_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string");
}

export function encryptSensitiveData(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSensitiveData(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted token format");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export class ZohoAuthError extends Error {
  constructor(
    public readonly clientId: string,
    message: string
  ) {
    super(message);
    this.name = "ZohoAuthError";
  }
}

export class ZohoTokenManager {
  async getConfig(clientId: string, tenantId: string) {
    const [row] = await db
      .select()
      .from(zohoSyncConfig)
      .where(and(eq(zohoSyncConfig.clientId, clientId), eq(zohoSyncConfig.tenantId, tenantId)))
      .limit(1);
    return row ?? null;
  }

  async isConnected(clientId: string, tenantId: string): Promise<boolean> {
    const cfg = await this.getConfig(clientId, tenantId);
    if (!cfg?.isActive) return false;
    if (cfg.authMethod === "oauth2") {
      return Boolean(cfg.zohoRefreshToken);
    }
    return Boolean(cfg.zohoApiKey);
  }

  async getValidToken(clientId: string, tenantId: string): Promise<string> {
    const cfg = await this.getConfig(clientId, tenantId);
    if (!cfg) {
      throw new ZohoAuthError(clientId, "Zoho not configured for client");
    }

    if (cfg.authMethod === "api_key") {
      return decryptSensitiveData(cfg.zohoApiKey);
    }

    if (!cfg.zohoRefreshToken || !cfg.zohoAccessToken) {
      throw new ZohoAuthError(clientId, "OAuth tokens missing — reconnect Zoho");
    }

    const expiresAt = cfg.zohoTokenExpiresAt?.getTime() ?? 0;
    const refreshThreshold = Date.now() + 5 * 60 * 1000;
    if (expiresAt > refreshThreshold) {
      return decryptSensitiveData(cfg.zohoAccessToken);
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const clientIdEnv = tenant?.zohoClientId ?? process.env.ZOHO_CLIENT_ID;
    const clientSecret = tenant?.zohoClientSecret ?? process.env.ZOHO_CLIENT_SECRET;
    if (!clientIdEnv || !clientSecret) {
      throw new ZohoAuthError(clientId, "Zoho OAuth app credentials not configured");
    }

    const refreshToken = decryptSensitiveData(cfg.zohoRefreshToken);
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientIdEnv,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new ZohoAuthError(clientId, `Token refresh failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!data.access_token) {
      throw new ZohoAuthError(clientId, data.error ?? "Token refresh returned no access_token");
    }

    const expiresIn = data.expires_in ?? 3600;
    await this.storeTokens(clientId, tenantId, {
      accessToken: data.access_token,
      refreshToken,
      expiresIn,
      orgId: cfg.zohoBooksOrgId ?? cfg.zohoOrgId ?? "",
    });

    return data.access_token;
  }

  async storeTokens(
    clientId: string,
    tenantId: string,
    tokens: { accessToken: string; refreshToken: string; expiresIn: number; orgId: string }
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const encAccess = encryptSensitiveData(tokens.accessToken);
    const encRefresh = encryptSensitiveData(tokens.refreshToken);

    const existing = await this.getConfig(clientId, tenantId);
    if (existing) {
      await db
        .update(zohoSyncConfig)
        .set({
          zohoAccessToken: encAccess,
          zohoRefreshToken: encRefresh,
          zohoTokenExpiresAt: expiresAt,
          zohoBooksOrgId: tokens.orgId || existing.zohoBooksOrgId,
          authMethod: "oauth2",
          updatedAt: new Date(),
        })
        .where(eq(zohoSyncConfig.id, existing.id));
    } else {
      await db.insert(zohoSyncConfig).values({
        tenantId,
        clientId,
        zohoApiKey: encAccess,
        zohoAccessToken: encAccess,
        zohoRefreshToken: encRefresh,
        zohoTokenExpiresAt: expiresAt,
        zohoBooksOrgId: tokens.orgId,
        zohoOrgId: tokens.orgId,
        authMethod: "oauth2",
        isActive: true,
      });
    }
  }

  async revokeTokens(clientId: string, tenantId: string): Promise<void> {
    await db
      .update(zohoSyncConfig)
      .set({
        zohoAccessToken: null,
        zohoRefreshToken: null,
        zohoTokenExpiresAt: null,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(eq(zohoSyncConfig.clientId, clientId), eq(zohoSyncConfig.tenantId, tenantId)));
  }

  async exchangeCodeForTokens(
    code: string,
    tenantId: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const clientIdEnv = tenant?.zohoClientId ?? process.env.ZOHO_CLIENT_ID;
    const clientSecret = tenant?.zohoClientSecret ?? process.env.ZOHO_CLIENT_SECRET;
    if (!clientIdEnv || !clientSecret) {
      throw new ZohoHttpError("OAuth app not configured", 400);
    }

    const body = new URLSearchParams({
      code,
      client_id: clientIdEnv,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!res.ok || !data.access_token || !data.refresh_token) {
      throw new ZohoHttpError(data.error ?? `OAuth exchange failed: ${res.status}`, res.status);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
    };
  }
}

export const zohoTokenManager = new ZohoTokenManager();
