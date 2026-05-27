import { db } from "@ca-suite/db/client";
import { uploads } from "@ca-suite/db";
import { eq, and } from "drizzle-orm";

export async function assertUploadTenant(uploadId: string, tenantId: string) {
  const [upload] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.tenantId, tenantId)))
    .limit(1);
  if (!upload) throw new Error(`Upload ${uploadId} not found for tenant`);
  return upload;
}
