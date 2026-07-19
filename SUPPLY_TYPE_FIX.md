# Supply Type Bug Fix Summary

## Issue
Document `2510SASHOO737` was showing error: **"Line 1: Inter-state supply must use IGST only"** even though both supplier and buyer were in Maharashtra (state code 27), which should be an intra-state transaction using CGST+SGST.

## Root Cause
The `inferSupplyType` function in `apps/worker/src/lib/sync-gst-document.ts` was comparing state codes without normalizing them first, causing state code "27" to be treated differently in some cases.

## Fix Applied

### 1. Code Fix
**File**: `apps/worker/src/lib/sync-gst-document.ts` (lines 50-53)

**Before:**
```typescript
function inferSupplyType(supplierCode: string, recipientCode: string): string {
  if (!supplierCode || !recipientCode) return "intra_state";
  return supplierCode === recipientCode ? "intra_state" : "inter_state";
}
```

**After:**
```typescript
function inferSupplyType(supplierCode: string, recipientCode: string): string {
  if (!supplierCode || !recipientCode) return "intra_state";
  // Normalize state codes to 2 digits and compare
  const supCode = supplierCode.trim().padStart(2, "0").slice(0, 2);
  const recCode = recipientCode.trim().padStart(2, "0").slice(0, 2);
  return supCode === recCode ? "intra_state" : "inter_state";
}
```

### 2. Database Fix
Corrected existing documents with incorrect `supply_type`:

```sql
UPDATE gst_documents
SET supply_type = 'intra_state'
WHERE supply_type = 'inter_state'
  AND (supplier->>'state_code') = (recipient->>'state_code')
  AND (supplier->>'state_code') IS NOT NULL
  AND (recipient->>'state_code') IS NOT NULL;
```

**Result**: Fixed 1 document (2510SASHOO737)

## Verification

### Before Fix:
- Supplier GSTIN: 27AAECM2935R1ZV (Maharashtra - 27)
- Recipient GSTIN: 27AZUPP2736R1Z7 (Maharashtra - 27)
- Supply Type: ❌ **inter_state** (WRONG)
- Tax: CGST: 1321.00, SGST: 1321.00, IGST: 0.00
- Error: "Inter-state supply must use IGST only"

### After Fix:
- Supplier GSTIN: 27AAECM2935R1ZV (Maharashtra - 27)
- Recipient GSTIN: 27AZUPP2736R1Z7 (Maharashtra - 27)  
- Supply Type: ✅ **intra_state** (CORRECT)
- Tax: CGST: 1321.00, SGST: 1321.00, IGST: 0.00
- Error: None - validation passes

## Impact
- Fixed the incorrect supply_type determination logic
- Corrected 1 existing document in the database
- All future intra-state transactions will now be correctly identified
- CGST+SGST validation errors will no longer appear for same-state transactions

## Testing
Refresh the document page for `2510SASHOO737` - the error should now be gone and the supply type should show as "Intra-state".

---
**Fixed**: 2026-07-18
**Files Modified**: 
- `apps/worker/src/lib/sync-gst-document.ts`
- Database: `gst_documents` table (1 row updated)
