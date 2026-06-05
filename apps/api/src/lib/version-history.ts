import { eq, and, asc } from "drizzle-orm";
import { db } from "@ca-suite/db/client";
import { documentVersions } from "@ca-suite/db";
import type { CaptureSource, GSTDocument } from "@ca-suite/shared";
import { diffGstDocuments } from "@ca-suite/shared";

export type VersionListItem = {
  id: string;
  versionNo: number;
  changeSummary: string | null;
  changedBy: string;
  changedAt: string;
  modificationChannel: string;
  captureSource?: CaptureSource;
  capturedAt?: string;
  uploadedBy?: string;
  changes: ReturnType<typeof diffGstDocuments>;
};

/** Versions newest-first with field-level diffs (before snapshot → state after that edit). */
export async function buildVersionList(
  documentId: string,
  tenantId: string,
  current: GSTDocument
): Promise<VersionListItem[]> {
  const rows = await db
    .select()
    .from(documentVersions)
    .where(
      and(eq(documentVersions.documentId, documentId), eq(documentVersions.tenantId, tenantId))
    )
    .orderBy(asc(documentVersions.versionNo));

  const items: VersionListItem[] = rows.map((row, i) => {
    const before = row.snapshot as unknown as GSTDocument;
    const after =
      i + 1 < rows.length
        ? (rows[i + 1]!.snapshot as unknown as GSTDocument)
        : current;

    return {
      id: row.id,
      versionNo: row.versionNo,
      changeSummary: row.changeSummary,
      changedBy: row.changedBy,
      changedAt: row.changedAt.toISOString(),
      modificationChannel: "web",
      captureSource: before.capture_source,
      capturedAt: before.captured_at,
      uploadedBy: before.uploaded_by,
      changes: diffGstDocuments(before, after),
    };
  });

  return items.reverse();
}
