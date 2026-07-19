# Handling Issue Records - Complete Guide

## Problem
Users have documents with extraction issues that show "Needs attention" status, but there's no way to:
1. Delete bad/duplicate records
2. Mark them as rejected without deleting
3. Re-process failed extractions

## Solution: Three Options for Users

### Option 1: Mark as Rejected (Soft Delete)
**When to use**: Document is incorrect but you want to keep audit trail

**How it works**:
- Document stage changes to "rejected"
- Stays in database for audit/compliance
- Hidden from main views by default
- Can add rejection reason

**API**: `POST /api/documents/:id/reject`

**UI Button**: Already exists in your codebase

---

### Option 2: Hard Delete (Permanent Removal)
**When to use**: Duplicate upload, test data, or completely wrong file

**How it works**:
- Removes document from database
- Deletes file from MinIO storage
- Cleans up all related records (lines, issues, versions)
- Creates audit log entry

**API**: `DELETE /api/documents/:id` (needs to be added)

**Implementation needed**: Add DELETE endpoint

---

### Option 3: Re-extract (Fix Issues)
**When to use**: Extraction failed or gave poor results, but file is valid

**How it works**:
- Keeps same document ID
- Re-runs extraction pipeline
- Updates existing record with new data
- Preserves upload metadata

**API**: `POST /api/documents/:id/reprocess`

**Implementation needed**: Add reprocess endpoint

---

## Implementation Plan

### Step 1: Add DELETE Endpoint (5 minutes)

Add to `apps/api/src/index.ts` after the reject endpoint (around line 1700):

```typescript
// Delete document permanently
app.delete<{ Params: { id: string } }>(
  "/api/documents/:id",
  async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    
    const result = await deleteGstDocument(req.params.id, ctx.tenantId);
    
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    
    await audit(
      ctx,
      "document.delete",
      "document",
      req.params.id,
      { permanent: true },
      req
    );
    
    return { ok: true, deleted: req.params.id };
  }
);
```

### Step 2: Add Reprocess Endpoint (10 minutes)

```typescript
// Reprocess document extraction
app.post<{ Params: { id: string } }>(
  "/api/documents/:id/reprocess",
  async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    
    const [doc] = await db
      .select({ uploadId: gstDocuments.uploadId, stage: gstDocuments.stage })
      .from(gstDocuments)
      .where(
        and(
          eq(gstDocuments.id, req.params.id),
          eq(gstDocuments.tenantId, ctx.tenantId)
        )
      )
      .limit(1);
    
    if (!doc) {
      return reply.status(404).send({ error: "Document not found" });
    }
    
    if (doc.stage === "locked") {
      return reply.status(409).send({ error: "Cannot reprocess locked document" });
    }
    
    // Reset to extracting stage and re-queue
    await db
      .update(gstDocuments)
      .set({
        stage: "extracting",
        updatedAt: new Date(),
      })
      .where(eq(gstDocuments.id, req.params.id));
    
    // Re-add to pipeline queue
    await pipelineQueue.add("extract", {
      uploadId: doc.uploadId,
      documentId: req.params.id,
    });
    
    await audit(
      ctx,
      "document.reprocess",
      "document",
      req.params.id,
      { reason: "user_requested" },
      req
    );
    
    return { ok: true, reprocessing: true };
  }
);
```

### Step 3: Add Frontend Actions (15 minutes)

Update `apps/web/src/components/documents/DocumentWorkspace.tsx`:

```typescript
// Add to action menu
const handleDelete = async () => {
  if (!confirm("Permanently delete this document? This cannot be undone.")) {
    return;
  }
  
  try {
    await api.delete(`/api/documents/${documentId}`);
    toast.success("Document deleted");
    navigate("/uploads");
  } catch (error) {
    toast.error("Failed to delete document");
  }
};

const handleReprocess = async () => {
  try {
    await api.post(`/api/documents/${documentId}/reprocess`);
    toast.success("Document re-queued for extraction");
    refetch();
  } catch (error) {
    toast.error("Failed to reprocess document");
  }
};

// Add to action buttons (in the UI where you have the issues icon)
{hasIssues && (
  <DropdownMenu>
    <DropdownMenuTrigger>
      <Button variant="outline" size="sm">
        Fix Issues
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={handleReprocess}>
        <RefreshIcon className="mr-2" />
        Re-extract Document
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setShowRejectDialog(true)}>
        <BanIcon className="mr-2" />
        Mark as Rejected
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem 
        onClick={handleDelete}
        className="text-destructive"
      >
        <TrashIcon className="mr-2" />
        Delete Permanently
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

---

## Quick Fix: Just Add Delete Button (2 minutes)

If you want the quickest solution, just add the DELETE endpoint and update the UI:

**1. Add to `apps/api/src/index.ts`:**

```typescript
app.delete<{ Params: { id: string } }>(
  "/api/documents/:id",
  async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const result = await deleteGstDocument(req.params.id, ctx.tenantId);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    await audit(ctx, "document.delete", "document", req.params.id, {}, req);
    return { ok: true };
  }
);
```

**2. Add delete function to `apps/web/src/lib/api.ts`:**

```typescript
export const deleteDocument = (id: string) =>
  fetch(`${API_BASE}/documents/${id}`, {
    method: "DELETE",
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error("Failed to delete");
    return r.json();
  });
```

**3. Add trash icon to your document list** (where you show the issues icon):

```tsx
<button
  onClick={async () => {
    if (confirm("Delete this document?")) {
      await deleteDocument(doc.id);
      refetch();
    }
  }}
  className="text-red-500 hover:text-red-700"
>
  <TrashIcon />
</button>
```

---

## Recommended Workflow

For documents with issues:

1. **User sees "Needs attention"** → Clicks to review
2. **Options presented**:
   - ✅ **Fix manually** → Edit fields and save
   - 🔄 **Re-extract** → Try extraction again (maybe Claude will catch it this time!)
   - ⛔ **Reject** → Mark as rejected (soft delete, keeps audit trail)
   - 🗑️ **Delete** → Permanently remove (for duplicates/wrong files)

3. **Rejected documents**:
   - Hidden from main list by default
   - Can be filtered to show: "Show rejected documents"
   - Can be un-rejected if needed
   - Kept for compliance/audit purposes

---

## Status Flow

```
uploaded → extracting → ready_for_review → locked ✓
                ↓
              failed → [re-extract] → ready_for_review
                ↓
            rejected → [stays in DB for audit]
                ↓
            [delete] → permanently removed
```

---

## Summary

**Minimal Solution** (5 min): Add DELETE endpoint + trash button  
**Recommended Solution** (30 min): Add DELETE + REPROCESS endpoints + dropdown menu  
**Full Solution** (1 hour): Above + rejected documents filter + bulk actions

Choose based on urgency - the minimal solution will solve your immediate problem, and you can enhance it later.

---

**Created**: 2026-07-18
**Priority**: High - Users need way to handle bad extractions
