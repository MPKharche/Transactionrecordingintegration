import { EXTRACTOR_TIMEOUT_MS } from "@ca-suite/shared/server";
import type { ExtractorResponse } from "@ca-suite/zoho-schema";

const EXTRACTOR_URL = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
const EXTRACTOR_SECRET =
  process.env.EXTRACTOR_SHARED_SECRET?.trim() ||
  (process.env.NODE_ENV !== "production" ? "change-me" : "");

let resolvedExtractUrl: string | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractorOrigins(): string[] {
  const origins = new Set<string>();
  for (const endpoint of extractorEndpoints()) {
    try {
      origins.add(new URL(endpoint).origin);
    } catch {
      // Ignore malformed endpoint candidates.
    }
  }
  return Array.from(origins);
}

async function isCaExtractorOrigin(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const health = (await res.json()) as Record<string, unknown>;
    return "invoice2data" in health && "openrouter" in health;
  } catch {
    return false;
  }
}

/** Pick the first origin that is actually CA extractor (not another app on same port). */
async function resolveExtractEndpoint(): Promise<string> {
  if (resolvedExtractUrl) return resolvedExtractUrl;
  for (const origin of extractorOrigins()) {
    if (await isCaExtractorOrigin(origin)) {
      resolvedExtractUrl = `${origin}/extract`;
      return resolvedExtractUrl;
    }
  }
  return extractorEndpoints()[0];
}

function extractorEndpoints(): string[] {
  const base = EXTRACTOR_URL.replace(/\/+$/, "");
  if (base.endsWith("/extract")) return [base];
  const root = base.endsWith("/api") ? base.slice(0, -4) : base;
  const localFallbacks = [
    "http://localhost:8011/extract",
    "http://127.0.0.1:8011/extract",
    "http://localhost:8000/extract",
    "http://127.0.0.1:8000/extract",
  ];
  const urls = [
    ...localFallbacks,
    `${base}/extract`,
    `${base}/api/extract`,
    `${base}/api/v1/extract`,
    `${base}/v1/extract`,
    `${root}/extract`,
    `${root}/api/v1/extract`,
  ];
  try {
    const parsed = new URL(base);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      urls.push(
        "http://localhost:8000/api/v1/extract",
        "http://127.0.0.1:8000/api/v1/extract",
        "http://localhost:8011/api/v1/extract",
        "http://127.0.0.1:8011/api/v1/extract"
      );
    }
  } catch {
    // Ignore malformed custom URL and use configured candidates only.
  }
  return Array.from(new Set(urls));
}

export type InvoiceSegmentResult = {
  pageStart: number;
  pageEnd: number;
  billNumber?: string | null;
  confidence?: string;
};

export async function callDetectInvoices(
  storagePath: string,
  mimeType: string,
  pages: { page: number; text: string }[] = []
): Promise<{ segments: InvoiceSegmentResult[] }> {
  const headers = {
    "Content-Type": "application/json",
    ...(EXTRACTOR_SECRET ? { Authorization: `Bearer ${EXTRACTOR_SECRET}` } : {}),
  };
  const origin = (await resolveExtractEndpoint()).replace(/\/extract$/, "");
  const res = await fetch(`${origin}/detect-invoices`, {
    method: "POST",
    headers,
    body: JSON.stringify({ storage_path: storagePath, mime_type: mimeType, pages }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`detect-invoices ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { segments: InvoiceSegmentResult[] };
}

export async function callExtractorResilient(
  storagePath: string,
  ocrText: string,
  minioUrl: string,
  mimeType: string,
  docTypeHint = "",
  pageStart?: number,
  pageEnd?: number,
  attempt = 0
): Promise<ExtractorResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTOR_TIMEOUT_MS);

  try {
    const payload = JSON.stringify({
      storage_path: storagePath,
      ocr_text: ocrText,
      source_url: minioUrl,
      mime_type: mimeType,
      doc_type_hint: docTypeHint,
      ...(pageStart != null ? { page_start: pageStart } : {}),
      ...(pageEnd != null ? { page_end: pageEnd } : {}),
    });
    const headers = {
      "Content-Type": "application/json",
      ...(EXTRACTOR_SECRET ? { Authorization: `Bearer ${EXTRACTOR_SECRET}` } : {}),
    };
    const url = await resolveExtractEndpoint();
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt < 2) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "8", 10);
        await sleep(Math.min(retryAfter, 30) * 1000);
        return callExtractorResilient(
          storagePath,
          ocrText,
          minioUrl,
          mimeType,
          docTypeHint,
          pageStart,
          pageEnd,
          attempt + 1
        );
      }
      throw new Error(`Extractor overloaded (${res.status})`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Extractor returned ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as ExtractorResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable =
      message.includes("abort") ||
      message.includes("ECONNRESET") ||
      message.includes("fetch failed") ||
      message.includes("socket");

    if (retryable && attempt < 2) {
      await sleep(3000 * (attempt + 1));
      return callExtractorResilient(
        storagePath,
        ocrText,
        minioUrl,
        mimeType,
        docTypeHint,
        pageStart,
        pageEnd,
        attempt + 1
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
