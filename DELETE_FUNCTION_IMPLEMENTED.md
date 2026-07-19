# Delete Function for Issue Records - Implementation Complete

## ✅ What Was Implemented

### 1. Backend: DELETE Endpoint
**File**: `apps/api/src/index.ts` (after line 1700)

Added permanent delete endpoint:
```typescript
app.delete<{ Params: { id: string } }>(
  "/api/documents/:id",
  async (req, reply) => {
    const ctx = (req as unknown as { auth: AuthContext }).auth;
    const result = await deleteGstDocument(req.params.id, ctx.tenantId);
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    await audit(ctx, "document.delete", "document", req.params.id, { permanent: true }, req);
    return { ok: true, deleted: req.params.id };
  }
);
```

**What it does**:
- Deletes document from database
- Removes file from MinIO storage
- Cleans up all related records (lines, issues, versions)
- Creates audit log entry
- Returns success/error status

### 2. Frontend: Delete Button in Table
**File**: `apps/web/src/components/documents/DocumentWorklistTable.tsx`

Added trash icon button that appears for:
- Documents with issues (`d.issues.length > 0`)
- Failed documents (`d.stage === "failed"`)
- NOT for locked documents (already in records)

**Button behavior**:
- Shows trash icon (Trash2) next to retry button
- Confirms before deleting: "Delete [filename]? This cannot be undone."
- Calls API to delete
- Refreshes page on success
- Shows error alert if fails

## 🎯 User Experience

### Before (Problem):
- User sees "Needs attention" with issues icon
- No way to remove bad/duplicate records
- Table cluttered with unfixable documents

### After (Solution):
- User sees trash icon next to issues
- Click trash → Confirm → Document deleted permanently
- Clean worklist with only valid documents

## 📍 Where the Button Appears

In the **Uploads** screen table, last column:
- ✅ For documents with extraction issues
- ✅ For failed documents  
- ✅ Next to the retry button
- ❌ NOT for locked documents (use Records screen for those)

## 🔒 Safety Features

1. **Confirmation dialog** - Prevents accidental deletion
2. **Audit trail** - All deletions logged with user ID and timestamp
3. **Locked documents protected** - Cannot delete records already in register
4. **Tenant isolation** - Users can only delete their own tenant's documents

## 🧪 How to Test

1. **Upload a document that will have issues** (or use existing ones from screenshot)
2. **Go to Uploads screen** (http://127.0.0.1:5175/uploads)
3. **Find row with "Needs attention" status**
4. **Look for trash icon** in the last column
5. **Click trash icon** → Confirmation dialog appears
6. **Click OK** → Document deleted, page refreshes

## 📊 API Already Had Delete Function

The delete functionality already existed in:
- ✅ `apps/api/src/lib/delete-document.ts` - Core delete logic
- ✅ `apps/web/src/lib/api.ts` (line 228) - Frontend API client

We just:
1. Added the REST endpoint to expose it
2. Added UI button to call it

## 🔄 Alternative Actions Available

Users now have 3 options for problematic documents:

| Action | When to Use | Effect |
|--------|------------|--------|
| **🗑️ Delete** | Duplicate, wrong file, test data | Permanent removal |
| **⛔ Reject** | Keep for audit but exclude | Soft delete (stays in DB) |
| **🔄 Retry** | Extraction failed, try again | Re-process same file |

## 📝 Future Enhancements

Consider adding (documented in HANDLING_ISSUE_RECORDS.md):

1. **Bulk delete** - Select multiple documents and delete at once
2. **Reprocess button** - Re-run extraction on existing document
3. **Rejected documents view** - Filter to show/hide rejected documents
4. **Undo delete** - Soft delete first, hard delete after 30 days

## 🚀 Ready to Use

The feature is now live! Just restart your services if needed:

```bash
# API should auto-reload with --reload flag
# Web should hot-reload automatically

# If needed, restart:
cd c:/Users/mayur/Downloads/AppDevelopment/ca-saas
npm run dev
```

---

**Status**: ✅ Complete and Ready  
**Files Modified**: 2 (API endpoint + UI button)  
**Lines Changed**: ~50 lines total  
**Testing Required**: Manual test in uploads screen
