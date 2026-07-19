# Manual Billing/Invoice Entry Feature - Implementation Plan

## Requirements Summary

### 1. Auto-fill Client Details (Purchase)
When Doc Type = "Purchase Invoice":
- **Recipient (Bill To)** = Selected Client (from master)
- Auto-populate: Name, GSTIN, Address, City, State, Mobile
- **Supplier (Bill From)** = Manual entry (the vendor)

### 2. Smart Line Items Table
Like ClearTax/accounting software:
- Multiple line items support
- Columns: Description, HSN/SAC, Quantity, Rate, Amount
- Add/Remove rows easily
- Auto-calculate amounts

### 3. Auto GST Calculation
- User selects: GST% (0%, 5%, 12%, 18%, 28%)
- System auto-detects: Intra-state vs Inter-state
- Auto-populates: CGST/SGST (intra) OR IGST (inter)
- Auto-calculates: Taxable amount, Tax amounts, Total

### 4. Minimal User Input
User only enters:
- ✅ Vendor details (for purchase)
- ✅ Item descriptions
- ✅ Quantities & rates
- ✅ GST percentage

System auto-fills:
- ✅ Client details (from master)
- ✅ Supply type (intra/inter based on states)
- ✅ CGST/SGST or IGST calculations
- ✅ Totals

### 5. New Menu: "Create Invoice"
Separate from Upload feature:
- Simple billing interface
- Focus on GST compliance
- Not full accounting (no ledgers, no double-entry)
- Just invoice creation with proper GST structure

---

## Implementation Steps

### Step 1: Create New Menu Item
Add "Create Invoice" to sidebar between Upload and Records

### Step 2: Build Smart Invoice Form
Components needed:
1. Header: Client, Doc Type, Date, Invoice Number
2. Party Section: 
   - For Purchase: Client auto-fills as "Bill To", User enters Vendor
   - For Sales: Client auto-fills as "Bill From", User enters Customer
3. Line Items Table:
   - Add/Remove rows
   - Auto-calculate line totals
4. GST Calculator:
   - Select GST% → Auto-calculate CGST/SGST or IGST
   - Based on supplier state vs recipient state
5. Summary Section:
   - Subtotal, Tax amounts, Grand Total

### Step 3: Smart Auto-Fill Logic
```typescript
// When client selected + doc type = Purchase:
if (docType === 'purchase_invoice') {
  recipient = {
    name: client.name,
    gstin: client.gstin,
    address: client.address,
    city: client.city,
    state: client.state,
    mobile: client.mobile
  }
}

// When states detected:
if (supplierState === recipientState) {
  supplyType = 'intra_state'
  // Show CGST + SGST fields
} else {
  supplyType = 'inter_state'
  // Show IGST field only
}

// When GST% selected:
gstRate = selectedRate // e.g., 18
if (supplyType === 'intra_state') {
  cgstRate = gstRate / 2 // 9%
  sgstRate = gstRate / 2 // 9%
  cgstAmount = taxableAmount * cgstRate / 100
  sgstAmount = taxableAmount * sgstRate / 100
} else {
  igstRate = gstRate // 18%
  igstAmount = taxableAmount * igstRate / 100
}
```

---

## UI Design

### Layout Structure:
```
┌─────────────────────────────────────────────────┐
│  Create Invoice                            [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Client: [Dropdown] ▼   Doc Type: [Dropdown] ▼ │
│  Invoice #: [____]      Date: [__-__-____]     │
│  Financial Year: 2026-27                        │
│                                                 │
├─────────────────────────────────────────────────┤
│  SUPPLIER (Bill From)    │  RECIPIENT (Bill To) │
│  [If Purchase → Manual]  │  [Auto-filled]       │
│  Name: [___________]     │  Name: GUNJAN ENT... │
│  GSTIN: [__________]     │  GSTIN: 27AZUPP...   │
│  State: [Dropdown] ▼     │  State: Maharashtra  │
│                          │                      │
│  Supply Type: [Auto: Intra-State]              │
├─────────────────────────────────────────────────┤
│  LINE ITEMS                                     │
│  ┌──────────────────────────────────────────┐  │
│  │ # │ Description │ HSN │ Qty │ Rate │ Amt│  │
│  ├───┼─────────────┼─────┼─────┼──────┼────┤  │
│  │ 1 │[_________]  │[___]│[__]│[____]│ ₹0 │  │
│  │ 2 │[_________]  │[___]│[__]│[____]│ ₹0 │  │
│  └──────────────────────────────────────────┘  │
│  [+ Add Line Item]                              │
├─────────────────────────────────────────────────┤
│  GST CALCULATION                                │
│  GST Rate: [○ 0% ○ 5% ○ 12% ◉ 18% ○ 28%]     │
│                                                 │
│  Subtotal (Taxable):     ₹10,000.00           │
│  CGST @ 9%:              ₹900.00   [Auto]      │
│  SGST @ 9%:              ₹900.00   [Auto]      │
│  ──────────────────────────────────            │
│  Total:                  ₹11,800.00            │
├─────────────────────────────────────────────────┤
│           [Cancel]  [Save Invoice]              │
└─────────────────────────────────────────────────┘
```

---

## File Structure

### New Files to Create:
```
apps/web/src/features/billing/
  ├── BillingScreen.tsx              # Main screen
  ├── InvoiceForm.tsx                # Smart form
  ├── LineItemsTable.tsx             # Editable table
  ├── GSTCalculator.tsx              # Auto-calc logic
  ├── PartySection.tsx               # Supplier/Recipient
  └── hooks/
      ├── useAutoFillClient.ts       # Auto-fill logic
      ├── useGSTCalculation.ts       # GST calc logic
      └── useSupplyTypeDetection.ts  # Intra/Inter detection
```

---

## Key Features

### 1. Smart Client Auto-Fill
```typescript
// When client changes
const handleClientChange = (clientId: string) => {
  const client = clients.find(c => c.id === clientId)
  
  if (docType === 'purchase_invoice') {
    // Client is the buyer (Bill To)
    setRecipient({
      name: client.name,
      gstin: client.gstin,
      address: client.address,
      city: client.city,
      state: client.state,
      stateCode: client.stateCode,
      mobile: client.mobile
    })
  } else if (docType === 'sales_invoice') {
    // Client is the seller (Bill From)
    setSupplier({...client})
  }
}
```

### 2. Line Items Management
```typescript
interface LineItem {
  id: string
  description: string
  hsnSac: string
  quantity: number
  rate: number
  amount: number // auto-calculated
}

const addLineItem = () => {
  setLineItems([...lineItems, {
    id: uuid(),
    description: '',
    hsnSac: '',
    quantity: 1,
    rate: 0,
    amount: 0
  }])
}

const updateLineItem = (id: string, field: string, value: any) => {
  setLineItems(lineItems.map(item => {
    if (item.id === id) {
      const updated = { ...item, [field]: value }
      // Auto-calculate amount
      updated.amount = updated.quantity * updated.rate
      return updated
    }
    return item
  }))
}
```

### 3. GST Auto-Calculation
```typescript
const calculateGST = (
  subtotal: number,
  gstRate: number,
  supplyType: 'intra_state' | 'inter_state'
) => {
  if (supplyType === 'intra_state') {
    const cgstRate = gstRate / 2
    const sgstRate = gstRate / 2
    const cgst = subtotal * cgstRate / 100
    const sgst = subtotal * sgstRate / 100
    return {
      cgst,
      sgst,
      igst: 0,
      cgstRate,
      sgstRate,
      igstRate: 0,
      total: subtotal + cgst + sgst
    }
  } else {
    const igst = subtotal * gstRate / 100
    return {
      cgst: 0,
      sgst: 0,
      igst,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: gstRate,
      total: subtotal + igst
    }
  }
}
```

### 4. Supply Type Detection
```typescript
const detectSupplyType = (
  supplierState: string,
  recipientState: string
): 'intra_state' | 'inter_state' => {
  // Extract 2-digit state codes
  const supCode = supplierState.slice(0, 2).padStart(2, '0')
  const recCode = recipientState.slice(0, 2).padStart(2, '0')
  
  return supCode === recCode ? 'intra_state' : 'inter_state'
}
```

---

## User Flow

### Creating a Purchase Invoice:

1. **User clicks** "Create Invoice" in sidebar
2. **Selects client**: "GUNJAN ENTERPRISES"
   - System auto-fills Recipient (Bill To) section
3. **Selects doc type**: "Purchase Invoice"
4. **Enters invoice number**: "INV-2025-001"
5. **Enters supplier** (Bill From):
   - Name: Maharashtra State Power
   - GSTIN: 27AAECM2935R1ZV
   - State: Maharashtra
   - System detects: "Intra-State" (both MH)
6. **Adds line items**:
   - Row 1: "Fly Ash", HSN: 26211000, Qty: 239.02, Rate: 221
   - Amount auto-calculates: ₹52,823.42
7. **Selects GST rate**: 18% (or 5%, 12%, 28%)
   - System shows: CGST @ 9% and SGST @ 9%
   - Auto-calculates: CGST = ₹2,371, SGST = ₹2,371
8. **Reviews totals**:
   - Subtotal: ₹52,823.42
   - CGST: ₹2,371.05
   - SGST: ₹2,371.05
   - Total: ₹57,565.52
9. **Clicks** "Save Invoice"
   - Toast: "Invoice created successfully"
   - Redirects to Upload/Records

---

## Benefits

### For Users:
- ✅ **80% less typing** - Client details auto-fill
- ✅ **No manual calculation** - GST auto-computed
- ✅ **No mistakes** - Supply type auto-detected
- ✅ **Fast data entry** - Like ClearTax UX
- ✅ **Multiple line items** - As many as needed
- ✅ **Clear validation** - Errors highlighted

### For GST Compliance:
- ✅ **Correct tax structure** - CGST/SGST vs IGST
- ✅ **Proper rates** - Standard GST slabs
- ✅ **Complete data** - All required fields
- ✅ **Audit trail** - Proper documentation

---

## Implementation Priority

### Phase 1: Core Functionality (2-3 hours)
1. Create BillingScreen with menu item
2. Build InvoiceForm with basic fields
3. Implement client auto-fill logic
4. Add line items table with add/remove

### Phase 2: Smart Features (2 hours)
1. Supply type auto-detection
2. GST auto-calculation
3. Real-time amount updates
4. Form validation

### Phase 3: Polish (1 hour)
1. Toast notifications
2. Error handling
3. Keyboard shortcuts
4. Responsive design

---

## Next Steps

Would you like me to:
1. **Create the complete billing screen** with all features?
2. **Start with Phase 1** and add smart features incrementally?
3. **Show a working prototype** first for approval?

Let me know and I'll start building!
