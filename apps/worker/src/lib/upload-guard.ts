import { db } from "@ca-suite/db/client";
import { uploads } from "@ca-suite/db";
import { eq } from "drizzle-orm";
export async function loadUploadOrThrow(uploadId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(uploads)
    .where(eq(uploads.id, uploadId))
    .limit(1);
  if (!row || row.tenantId !== tenantId) {
    throw new Error("Upload not found for tenant");
  }
  if (row.currentStage === "dead_letter") {
    throw new Error("Upload in dead_letter — use retry from UI");
  }
  return row;
}
