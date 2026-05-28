import { EXTRACTOR_TIMEOUT_MS } from "@ca-suite/shared";
import type { ExtractorResponse } from "@ca-suite/zoho-schema";

const EXTRACTOR_URL = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
const EXTRACTOR_SECRET = process.env.EXTRACTOR_SHARED_SECRET ?? "";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callExtractorResilient(
  storagePath: string,
  ocrText: string,
  minioUrl: string,
  mimeType: string,
  attempt = 0
): Promise<ExtractorResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTOR_TIMEOUT_MS);

  try {
    const res = await fetch(`${EXTRACTOR_URL}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(EXTRACTOR_SECRET ? { Authorization: `Bearer ${EXTRACTOR_SECRET}` } : {}),
      },
      body: JSON.stringify({
        storage_path: storagePath,
        ocr_text: ocrText,
        source_url: minioUrl,
        mime_type: mimeType,
      }),
      signal: controller.signal,
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt < 2) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "8", 10);
        await sleep(Math.min(retryAfter, 30) * 1000);
        return callExtractorResilient(storagePath, ocrText, minioUrl, mimeType, attempt + 1);
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
      return callExtractorResilient(storagePath, ocrText, minioUrl, mimeType, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
