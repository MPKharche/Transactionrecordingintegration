/**
 * TIER 3: Integration Services
 * Handles Zoho, GST Portal, Email, and other ecosystem integrations
 */

import { db } from "@ca-suite/db/client";
import {
  zohoSyncConfig,
  gstPortalConfig,
  emailForwardConfig,
  categoryMaster,
  gstDocuments,
  documentLines,
  clients,
} from "@ca-suite/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-change-in-production";

/**
 * Encrypt sensitive data before storage
 */
export function encryptSensitiveData(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)),
    iv
  );
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt sensitive data from storage
 */
export function decryptSensitiveData(encrypted: string): string {
  const [ivHex, ciphertext] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32)),
    iv
  );
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ============ ZOHO SYNC SERVICE ============

interface ZohoInvoice {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  reference_number?: string;
  customer_name: string;
  customer_email?: string;
  line_items: Array<{
    item_id: string;
    item_name: string;
    description?: string;
    quantity: number;
    unit: string;
    item_price: number;
    tax_id?: string;
    tax_name?: string;
    tax_percentage?: number;
  }>;
  sub_total: number;
  tax_total: number;
  total: number;
  currency_code: string;
}

interface ZohoSyncResult {
  invoicesPulled: number;
  invoicesPushed: number;
  conflicts: string[];
  errors: string[];
}

export async function initializeZohoSync(
  tenantId: string,
  clientId: string,
  apiKey: string,
  orgId: string
): Promise<{ success: boolean; configId?: string; error?: string }> {
  try {
    // Encrypt API key before storing
    const encryptedKey = encryptSensitiveData(apiKey);

    const [config] = await db
      .insert(zohoSyncConfig)
      .values({
        tenantId,
        clientId,
        zohoApiKey: encryptedKey,
        zohoOrgId: orgId,
        syncStatus: "idle",
      })
      .returning();

    return { success: true, configId: config.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize Zoho sync",
    };
  }
}

export async function pullInvoicesFromZoho(
  tenantId: string,
  clientId: string
): Promise<{ success: boolean; invoices?: ZohoInvoice[]; error?: string }> {
  try {
    // Get Zoho config
    const [config] = await db
      .select()
      .from(zohoSyncConfig)
      .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)))
      .limit(1);

    if (!config) {
      return { success: false, error: "Zoho sync not configured" };
    }

    if (!config.zohoApiKey || !config.zohoOrgId) {
      return { success: false, error: "Zoho credentials incomplete" };
    }

    // In production, call Zoho API
    // For now, return mock implementation
    console.log("Pulling invoices from Zoho for org:", config.zohoOrgId);

    // TODO: Implement actual Zoho API calls
    // const apiKey = decryptSensitiveData(config.zohoApiKey);
    // const response = await fetch(`https://www.zohoapis.com/books/v3/invoices`, {
    //   headers: {
    //     "Authorization": `Zoho-oauthtoken ${apiKey}`,
    //     "X-com-zoho-books-organizationid": config.zohoOrgId,
    //   },
    // });

    return { success: true, invoices: [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to pull from Zoho",
    };
  }
}

export async function pushRegisterToZoho(
  tenantId: string,
  clientId: string,
  registerData: any
): Promise<{ success: boolean; pushed?: number; error?: string }> {
  try {
    const [config] = await db
      .select()
      .from(zohoSyncConfig)
      .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)))
      .limit(1);

    if (!config) {
      return { success: false, error: "Zoho sync not configured" };
    }

    // TODO: Implement actual Zoho API push
    console.log("Pushing register data to Zoho");

    return { success: true, pushed: registerData.length };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to push to Zoho",
    };
  }
}

export async function syncZohoBooks(
  tenantId: string,
  clientId: string
): Promise<ZohoSyncResult> {
  const result: ZohoSyncResult = {
    invoicesPulled: 0,
    invoicesPushed: 0,
    conflicts: [],
    errors: [],
  };

  try {
    // Pull invoices from Zoho
    const pullResult = await pullInvoicesFromZoho(tenantId, clientId);
    if (!pullResult.success) {
      result.errors.push(pullResult.error || "Failed to pull from Zoho");
      return result;
    }

    result.invoicesPulled = pullResult.invoices?.length || 0;

    // Get locked registers from CA Suite
    const lockedDocs = await db
      .select()
      .from(gstDocuments)
      .where(
        and(
          eq(gstDocuments.tenantId, tenantId),
          eq(gstDocuments.clientId, clientId),
          eq(gstDocuments.stage, "locked")
        )
      );

    // Push to Zoho
    const pushResult = await pushRegisterToZoho(tenantId, clientId, lockedDocs);
    if (!pushResult.success) {
      result.errors.push(pushResult.error || "Failed to push to Zoho");
      return result;
    }

    result.invoicesPushed = pushResult.pushed || 0;

    // Update sync config
    await db
      .update(zohoSyncConfig)
      .set({
        lastSyncAt: new Date(),
        syncStatus: "success",
        syncErrorMessage: null,
      })
      .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)));

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(errorMsg);

    // Mark sync as failed
    await db
      .update(zohoSyncConfig)
      .set({
        syncStatus: "failed",
        syncErrorMessage: errorMsg,
      })
      .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)))
      .catch(() => {}); // Ignore if update fails

    return result;
  }
}

// ============ GST PORTAL SYNC SERVICE ============

export async function initializeGstPortalSync(
  tenantId: string,
  clientId: string,
  gstin: string,
  token: string,
  refreshToken?: string
): Promise<{ success: boolean; configId?: string; error?: string }> {
  try {
    const encryptedToken = encryptSensitiveData(token);

    const [config] = await db
      .insert(gstPortalConfig)
      .values({
        tenantId,
        clientId,
        gstin,
        portalToken: encryptedToken,
        refreshToken: refreshToken ? encryptSensitiveData(refreshToken) : null,
        syncStatus: "idle",
      })
      .returning();

    return { success: true, configId: config.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize GST Portal sync",
    };
  }
}

export async function fetchGstr1FromPortal(
  tenantId: string,
  clientId: string,
  fy: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const [config] = await db
      .select()
      .from(gstPortalConfig)
      .where(and(eq(gstPortalConfig.tenantId, tenantId), eq(gstPortalConfig.clientId, clientId)))
      .limit(1);

    if (!config || !config.portalToken) {
      return { success: false, error: "GST Portal not configured" };
    }

    // TODO: Implement GSTN API call
    console.log("Fetching GSTR-1 for FY:", fy);

    // Mark fetch timestamp
    await db
      .update(gstPortalConfig)
      .set({ lastGstr1FetchAt: new Date() })
      .where(and(eq(gstPortalConfig.tenantId, tenantId), eq(gstPortalConfig.clientId, clientId)));

    return { success: true, data: {} };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch GSTR-1",
    };
  }
}

export async function fetchGstr2bFromPortal(
  tenantId: string,
  clientId: string,
  fy: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const [config] = await db
      .select()
      .from(gstPortalConfig)
      .where(and(eq(gstPortalConfig.tenantId, tenantId), eq(gstPortalConfig.clientId, clientId)))
      .limit(1);

    if (!config || !config.portalToken) {
      return { success: false, error: "GST Portal not configured" };
    }

    // TODO: Implement GSTN API call
    console.log("Fetching GSTR-2B for FY:", fy);

    await db
      .update(gstPortalConfig)
      .set({ lastGstr2bFetchAt: new Date() })
      .where(and(eq(gstPortalConfig.tenantId, tenantId), eq(gstPortalConfig.clientId, clientId)));

    return { success: true, data: {} };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch GSTR-2B",
    };
  }
}

// ============ EMAIL FORWARDING SERVICE ============

export async function initializeEmailForwarding(
  tenantId: string
): Promise<{ success: boolean; forwardAddress?: string; configId?: string; error?: string }> {
  try {
    // Generate unique forward address for tenant
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const forwardAddress = `tenant-${uniqueId}@ca-suite.forwarding.mail`;

    const [config] = await db
      .insert(emailForwardConfig)
      .values({
        tenantId,
        uniqueForwardAddress: forwardAddress,
        parseRules: {
          rules: [
            {
              trigger: "subject_contains",
              pattern: "INV",
              docType: "sales_invoice",
            },
          ],
        },
        clientMappings: {},
      })
      .returning();

    return { success: true, forwardAddress, configId: config.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize email forwarding",
    };
  }
}

// ============ CATEGORY MANAGEMENT ============

export async function initializeCategoryMaster(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create system categories
    const systemCategories = [
      { code: "capex", name: "Capital Expenditure" },
      { code: "revenue", name: "Revenue Expense" },
      { code: "salary", name: "Salary & Wages" },
      { code: "rent", name: "Rent & Lease" },
      { code: "office_supplies", name: "Office Supplies" },
      { code: "travel", name: "Travel & Transport" },
      { code: "utilities", name: "Utilities" },
      { code: "repairs", name: "Repairs & Maintenance" },
      { code: "depreciation", name: "Depreciation" },
      { code: "interest", name: "Interest Expense" },
    ];

    for (const cat of systemCategories) {
      await db
        .insert(categoryMaster)
        .values({
          tenantId,
          code: cat.code,
          name: cat.name,
          isSystemCategory: true,
        })
        .onConflictDoNothing();
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize category master",
    };
  }
}

export async function assignCategoryToLineItem(
  documentId: string,
  lineItemSeq: number,
  categoryCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(documentLines)
      .set({ lineItemCategory: categoryCode })
      .where(and(eq(documentLines.documentId, documentId), eq(documentLines.seq, lineItemSeq)));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign category",
    };
  }
}

export async function autoSuggestCategory(
  hsnCode: string,
  description: string
): Promise<{ suggestedCode?: string; suggestedName?: string }> {
  // HSN-based auto-suggestion logic
  const hsnToCategoryMap: Record<string, string> = {
    "6204": "salary", // Clothing (sometimes uniform for staff)
    "4407": "capex", // Furniture
    "6802": "office_supplies", // Articles of stone, plaster, cement
    "8527": "capex", // Audio/video equipment
    "2709": "utilities", // Mineral oils
    "6910": "utilities", // Ceramic articles
  };

  const suggestedCode = hsnToCategoryMap[hsnCode];
  if (suggestedCode) {
    const cat = await db
      .select()
      .from(categoryMaster)
      .where(eq(categoryMaster.code, suggestedCode))
      .limit(1);

    if (cat[0]) {
      return { suggestedCode: cat[0].code, suggestedName: cat[0].name };
    }
  }

  return {};
}
