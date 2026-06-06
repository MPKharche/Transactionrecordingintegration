import Decimal from "decimal.js";
import { db } from "@ca-suite/db/client";
import { partyMaster } from "@ca-suite/db";
import { and, eq } from "drizzle-orm";
import type { ZohoBooksClient, ZohoContactInput } from "./zoho-client.js";

export class ContactResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactResolutionError";
  }
}

export class ContactResolver {
  async resolve(
    gstin: string,
    contactType: "customer" | "vendor",
    client: ZohoBooksClient,
    tenantId: string
  ): Promise<string> {
    const normalized = gstin.trim().toUpperCase();
    if (!normalized) {
      throw new ContactResolutionError("GSTIN required for contact resolution");
    }

    const [cached] = await db
      .select()
      .from(partyMaster)
      .where(and(eq(partyMaster.tenantId, tenantId), eq(partyMaster.gstin, normalized)))
      .limit(1);

    if (cached?.zohoContactId) {
      return cached.zohoContactId;
    }

    const found = await client.contacts.search(normalized);
    if (found?.contact_id) {
      await this.storeContactId(tenantId, normalized, found.contact_id);
      return found.contact_id;
    }

    const input: ZohoContactInput = {
      contact_name: cached?.name ?? normalized,
      contact_type: contactType,
      gst_no: normalized,
      gst_treatment: "business_gst",
      place_of_contact: cached?.stateCode ?? undefined,
    };

    const created = await client.contacts.create(input);
    await this.storeContactId(tenantId, normalized, created.contact_id);
    return created.contact_id;
  }

  private async storeContactId(tenantId: string, gstin: string, contactId: string): Promise<void> {
    await db
      .update(partyMaster)
      .set({ zohoContactId: contactId, zohoContactVerifiedAt: new Date() })
      .where(and(eq(partyMaster.tenantId, tenantId), eq(partyMaster.gstin, gstin)));
  }
}

export const contactResolver = new ContactResolver();
