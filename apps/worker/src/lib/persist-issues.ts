import { db } from "@ca-suite/db/client";
import { documentIssues } from "@ca-suite/db";
import { eq } from "drizzle-orm";

export async function saveDocumentIssues(
  documentId: string,
  issues: { field: string; severity: "error" | "warning"; message: string }[]
) {
  await db.delete(documentIssues).where(eq(documentIssues.documentId, documentId));
  if (!issues.length) return;
  await db.insert(documentIssues).values(
    issues.map((i) => ({
      documentId,
      field: i.field,
      severity: i.severity,
      message: i.message,
    }))
  );
}
