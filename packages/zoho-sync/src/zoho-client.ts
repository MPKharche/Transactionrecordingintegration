import Decimal from "decimal.js";
import type { CircuitBreaker } from "./circuit-breaker.js";
import type { StructuredLogger } from "./structured-logger.js";
import { ZohoHttpError, withRetry, isRetryableZohoError } from "./retry.js";
import type { ZohoTokenManager } from "./zoho-token-manager.js";

const ZOHO_BASE_URL = "https://www.zohoapis.in/books/v3";

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  gst_no?: string;
}

export interface ZohoContactInput {
  contact_name: string;
  contact_type: "customer" | "vendor";
  gst_no?: string;
  gst_treatment?: string;
  place_of_contact?: string;
}

export interface ZohoLineItem {
  name: string;
  hsn_or_sac: string;
  quantity: Decimal;
  rate: Decimal;
  tax_id?: string;
  product_type: "goods" | "service";
  description?: string;
}

export interface ZohoInvoiceInput {
  customer_id: string;
  invoice_number: string;
  date: string;
  place_of_supply: string;
  gst_treatment: "business_gst" | "business_none" | "overseas" | "consumer";
  gst_no?: string;
  line_items: ZohoLineItem[];
  is_debit_note?: boolean;
}

export interface ZohoBillInput {
  vendor_id: string;
  bill_number: string;
  date: string;
  place_of_supply: string;
  gst_treatment: string;
  gst_no?: string;
  line_items: ZohoLineItem[];
  is_debit_note?: boolean;
}

export type ZohoCreditNoteInput = Omit<ZohoInvoiceInput, "customer_id"> & { customer_id: string };
export type ZohoVendorCreditInput = Omit<ZohoBillInput, "vendor_id"> & { vendor_id: string };

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const sec = parseInt(header, 10);
  if (!Number.isNaN(sec)) return sec * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export class ZohoBooksClient {
  constructor(
    private readonly orgId: string,
    private readonly tokenManager: ZohoTokenManager,
    private readonly clientId: string,
    private readonly tenantId: string,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly logger: StructuredLogger
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    return this.circuitBreaker.call(async () =>
      withRetry(
        async () => {
          const token = await this.tokenManager.getValidToken(this.clientId, this.tenantId);
          const url = `${ZOHO_BASE_URL}${path}${path.includes("?") ? "&" : "?"}organization_id=${this.orgId}`;
          const res = await fetch(url, {
            method,
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

          if (!res.ok) {
            throw new ZohoHttpError(
              String(json.message ?? json.error ?? res.statusText),
              res.status,
              retryAfter,
              typeof json.code === "number" ? json.code : undefined
            );
          }

          return json as T;
        },
        { maxAttempts: 3, baseDelayMs: 5000, maxDelayMs: 60000 }
      )
    );
  }

  contacts = {
    search: async (gstin: string): Promise<ZohoContact | null> => {
      const data = await this.request<{ contacts?: ZohoContact[] }>(
        "GET",
        `/contacts?gst_no=${encodeURIComponent(gstin)}`
      );
      return data.contacts?.[0] ?? null;
    },
    create: async (input: ZohoContactInput): Promise<ZohoContact> => {
      const data = await this.request<{ contact: ZohoContact }>("POST", "/contacts", { contact: input });
      return data.contact;
    },
    update: async (id: string, input: Partial<ZohoContactInput>): Promise<ZohoContact> => {
      const data = await this.request<{ contact: ZohoContact }>("PUT", `/contacts/${id}`, { contact: input });
      return data.contact;
    },
  };

  invoices = {
    create: async (input: ZohoInvoiceInput): Promise<{ invoiceId: string; invoiceNumber: string }> => {
      const payload = this.serializeInvoice(input);
      const data = await this.request<{ invoice: { invoice_id: string; invoice_number: string } }>(
        "POST",
        "/invoices",
        { invoice: payload }
      );
      return { invoiceId: data.invoice.invoice_id, invoiceNumber: data.invoice.invoice_number };
    },
    update: async (id: string, input: Partial<ZohoInvoiceInput>): Promise<void> => {
      await this.request("PUT", `/invoices/${id}`, { invoice: this.serializeInvoice(input as ZohoInvoiceInput) });
    },
  };

  bills = {
    create: async (input: ZohoBillInput): Promise<{ billId: string }> => {
      const data = await this.request<{ bill: { bill_id: string } }>("POST", "/bills", {
        bill: this.serializeBill(input),
      });
      return { billId: data.bill.bill_id };
    },
    update: async (id: string, input: Partial<ZohoBillInput>): Promise<void> => {
      await this.request("PUT", `/bills/${id}`, { bill: this.serializeBill(input as ZohoBillInput) });
    },
  };

  creditNotes = {
    create: async (input: ZohoCreditNoteInput): Promise<{ creditNoteId: string }> => {
      const data = await this.request<{ creditnote: { creditnote_id: string } }>("POST", "/creditnotes", {
        creditnote: this.serializeInvoice(input),
      });
      return { creditNoteId: data.creditnote.creditnote_id };
    },
    update: async (id: string, input: Partial<ZohoCreditNoteInput>): Promise<void> => {
      await this.request("PUT", `/creditnotes/${id}`, { creditnote: this.serializeInvoice(input as ZohoCreditNoteInput) });
    },
  };

  vendorCredits = {
    create: async (input: ZohoVendorCreditInput): Promise<{ vendorCreditId: string }> => {
      const data = await this.request<{ vendor_credit: { vendor_credit_id: string } }>(
        "POST",
        "/vendorcredits",
        { vendor_credit: this.serializeBill(input) }
      );
      return { vendorCreditId: data.vendor_credit.vendor_credit_id };
    },
    update: async (id: string, input: Partial<ZohoVendorCreditInput>): Promise<void> => {
      await this.request("PUT", `/vendorcredits/${id}`, {
        vendor_credit: this.serializeBill(input as ZohoVendorCreditInput),
      });
    },
  };

  private serializeLineItems(lines: ZohoLineItem[]): Record<string, unknown>[] {
    return lines.map((l) => ({
      name: l.name,
      hsn_or_sac: l.hsn_or_sac,
      quantity: l.quantity.toFixed(4),
      rate: l.rate.toFixed(2),
      tax_id: l.tax_id,
      product_type: l.product_type,
      description: l.description,
    }));
  }

  private serializeInvoice(input: ZohoInvoiceInput): Record<string, unknown> {
    return {
      customer_id: input.customer_id,
      invoice_number: input.invoice_number,
      date: input.date,
      place_of_supply: input.place_of_supply,
      gst_treatment: input.gst_treatment,
      gst_no: input.gst_no,
      line_items: this.serializeLineItems(input.line_items),
      is_debit_note: input.is_debit_note,
    };
  }

  private serializeBill(input: ZohoBillInput): Record<string, unknown> {
    return {
      vendor_id: input.vendor_id,
      bill_number: input.bill_number,
      date: input.date,
      place_of_supply: input.place_of_supply,
      gst_treatment: input.gst_treatment,
      gst_no: input.gst_no,
      line_items: this.serializeLineItems(input.line_items),
      is_debit_note: input.is_debit_note,
    };
  }
}

export { isRetryableZohoError };
