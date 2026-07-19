# Manual Invoice/Billing Feature - Complete Specification

## Document Type Logic

### Auto-Fill Rules Based on Document Type:

#### 1. **Purchase Invoice** (Buying from supplier)
```
Client Role: BUYER (Bill To)
- Recipient (Bill To) = Selected Client [AUTO-FILLED]
  - Name, GSTIN, Address, State, Mobile from client master
- Supplier (Bill From) = Vendor [MANUAL ENTRY]
  - User enters vendor details

Flow: Vendor sells TO Client
```

#### 2. **Sales Invoice** (Selling to customer)
```
Client Role: SELLER (Bill From)
- Supplier (Bill From) = Selected Client [AUTO-FILLED]
  - Name, GSTIN, Address, State, Mobile from client master
- Recipient (Bill To) = Customer [MANUAL ENTRY]
  - User enters customer details

Flow: Client sells TO Customer
```

#### 3. **Credit Note Issued** (Refund to customer)
```
Same as Sales Invoice + Link to Original Invoice
- Supplier (Bill From) = Selected Client [AUTO-FILLED]
- Recipient (Bill To) = Customer [MANUAL ENTRY]
- Original Invoice: [Dropdown - Search existing sales invoices]
- Reason: [Text field]

Flow: Client returns money TO Customer
```

#### 4. **Credit Note Received** (Refund from supplier)
```
Same as Purchase Invoice + Link to Original Invoice
- Recipient (Bill To) = Selected Client [AUTO-FILLED]
- Supplier (Bill From) = Vendor [MANUAL ENTRY]
- Original Invoice: [Dropdown - Search existing purchase invoices]
- Reason: [Text field]

Flow: Vendor returns money TO Client
```

#### 5. **Debit Note Issued** (Claim from customer)
```
Same as Sales Invoice + Link to Original Invoice
- Supplier (Bill From) = Selected Client [AUTO-FILLED]
- Recipient (Bill To) = Customer [MANUAL ENTRY]
- Original Invoice: [Dropdown - Search existing sales invoices]
- Reason: [Text field]

Flow: Client claims additional amount FROM Customer
```

#### 6. **Debit Note Received** (Claim by supplier)
```
Same as Purchase Invoice + Link to Original Invoice
- Recipient (Bill To) = Selected Client [AUTO-FILLED]
- Supplier (Bill From) = Vendor [MANUAL ENTRY]
- Original Invoice: [Dropdown - Search existing purchase invoices]
- Reason: [Text field]

Flow: Vendor claims additional amount FROM Client
```

---

## Auto-Fill Logic Summary

| Document Type | Bill From (Supplier) | Bill To (Recipient) | Link to Invoice |
|---------------|---------------------|---------------------|-----------------|
| Purchase Invoice | Manual Entry | **Client (Auto)** | No |
| Sales Invoice | **Client (Auto)** | Manual Entry | No |
| Credit Note Issued | **Client (Auto)** | Manual Entry | Yes - Sales Invoice |
| Credit Note Received | Manual Entry | **Client (Auto)** | Yes - Purchase Invoice |
| Debit Note Issued | **Client (Auto)** | Manual Entry | Yes - Sales Invoice |
| Debit Note Received | Manual Entry | **Client (Auto)** | Yes - Purchase Invoice |

**Key Rule**: 
- **Purchase/CN Received/DN Received** = Client is RECIPIENT (Bill To)
- **Sales/CN Issued/DN Issued** = Client is SUPPLIER (Bill From)

---

## UI Design

### Form Layout with Dynamic Sections:

```
┌─────────────────────────────────────────────────────┐
│  Create Invoice                              [×]    │
├─────────────────────────────────────────────────────┤
│  Client: [Dropdown] ▼                               │
│  Doc Type: [○ Purchase ◉ Sales ○ Credit Note...] ▼ │
│  Invoice #: [_______]  Date: [____]  FY: 2026-27   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ For Credit/Debit Notes:                     │   │
│  │ Original Invoice: [Search & Select] ▼       │   │
│  │ Reason: [_____________________________]     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  SUPPLIER (Bill From)    │  RECIPIENT (Bill To)    │
│  ────────────────────────┼────────────────────────  │
│  [If Sales/CN/DN Issued] │  [If Purchase/CN/DN Rcv]│
│  ✅ AUTO-FILLED         │  ✅ AUTO-FILLED         │
│  Name: GUNJAN ENT...     │  Name: Vendor Name      │
│  GSTIN: 27AZUPP2736R1Z7  │  GSTIN: 27XXXXXX...     │
│  State: Maharashtra (27) │  State: Maharashtra (27)│
│                          │                         │
│  Supply Type: ✅ Intra-State (Auto-detected)       │
├─────────────────────────────────────────────────────┤
│  LINE ITEMS                                         │
│  ┌──────────────────────────────────────────────┐  │
│  │#│Description  │HSN/SAC│Qty│Rate │Amount   │❌│  │
│  ├─┼────────────┼───────┼───┼─────┼─────────┼─┤  │
│  │1│Fly Ash     │262110 │239│ 221 │₹52,823  │❌│  │
│  │2│[________]  │[____] │[_]│[___]│₹0       │❌│  │
│  └──────────────────────────────────────────────┘  │
│  [+ Add Line Item]                                  │
│                                                     │
├─────────────────────────────────────────────────────┤
│  GST CALCULATION                                    │
│  GST Rate: [○ 0% ○ 5% ○ 12% ◉ 18% ○ 28%]         │
│                                                     │
│  Subtotal (Taxable):        ₹52,823.42             │
│  CGST @ 9% (Auto):          ₹2,371.05              │
│  SGST @ 9% (Auto):          ₹2,371.05              │
│  ─────────────────────────────────────             │
│  Grand Total:               ₹57,565.52             │
│                                                     │
│  [Attach Document (Optional)]                       │
├─────────────────────────────────────────────────────┤
│                    [Cancel]  [Save Invoice]         │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Code Structure

### 1. Auto-Fill Logic
```typescript
const handleClientAndDocTypeChange = (
  clientId: string, 
  docType: DocType
) => {
  const client = clients.find(c => c.id === clientId)
  
  // Purchase-side documents: Client is recipient (Bill To)
  if (['purchase_invoice', 'credit_note_received', 'debit_note_received'].includes(docType)) {
    setRecipient({
      name: client.name,
      gstin: client.gstin,
      address: client.address,
      city: client.city,
      state: client.state,
      stateCode: client.stateCode,
      mobile: client.mobile,
      email: client.email,
    })
    // Supplier = manual entry
    setSupplier({ name: '', gstin: '', ... })
  }
  
  // Sales-side documents: Client is supplier (Bill From)
  else if (['sales_invoice', 'credit_note_issued', 'debit_note_issued'].includes(docType)) {
    setSupplier({
      name: client.name,
      gstin: client.gstin,
      address: client.address,
      city: client.city,
      state: client.state,
      stateCode: client.stateCode,
      mobile: client.mobile,
      email: client.email,
    })
    // Recipient = manual entry
    setRecipient({ name: '', gstin: '', ... })
  }
}
```

### 2. Credit/Debit Note Linking
```typescript
interface OriginalInvoiceRef {
  id: string
  docNumber: string
  docDate: string
  partyName: string
  amount: number
}

const handleOriginalInvoiceSelect = (invoiceId: string) => {
  const original = existingInvoices.find(inv => inv.id === invoiceId)
  
  // Pre-fill party details from original invoice
  if (docType === 'credit_note_issued' || docType === 'debit_note_issued') {
    // Copy customer details from original sales invoice
    setRecipient({
      name: original.recipient.name,
      gstin: original.recipient.gstin,
      ...
    })
  } else if (docType === 'credit_note_received' || docType === 'debit_note_received') {
    // Copy vendor details from original purchase invoice
    setSupplier({
      name: original.supplier.name,
      gstin: original.supplier.gstin,
      ...
    })
  }
  
  // Optionally pre-fill line items from original invoice
  setLineItems(original.lines.map(line => ({
    ...line,
    quantity: -line.quantity // Negative for credit notes
  })))
}
```

### 3. Invoice Search Component
```typescript
<InvoiceSearchDropdown
  label="Original Invoice"
  docType={docType}
  clientId={selectedClientId}
  onSelect={handleOriginalInvoiceSelect}
  filter={(inv) => {
    // For credit note issued - show sales invoices
    if (docType === 'credit_note_issued') {
      return inv.doc_type === 'sales_invoice'
    }
    // For credit note received - show purchase invoices
    if (docType === 'credit_note_received') {
      return inv.doc_type === 'purchase_invoice'
    }
    // Similar for debit notes
    return true
  }}
/>
```

### 4. Dynamic Form Rendering
```typescript
const showOriginalInvoiceField = [
  'credit_note_issued',
  'credit_note_received',
  'debit_note_issued',
  'debit_note_received'
].includes(docType)

const isClientSupplier = [
  'sales_invoice',
  'credit_note_issued',
  'debit_note_issued'
].includes(docType)

const isClientRecipient = [
  'purchase_invoice',
  'credit_note_received',
  'debit_note_received'
].includes(docType)
```

---

## File Structure

```
apps/web/src/features/billing/
  ├── BillingScreen.tsx              # Main screen with menu
  ├── InvoiceForm.tsx                # Smart form with all logic
  ├── components/
  │   ├── PartySection.tsx           # Supplier/Recipient fields
  │   ├── LineItemsTable.tsx         # Editable line items
  │   ├── GSTCalculator.tsx          # Auto GST calculation
  │   ├── InvoiceSearchDropdown.tsx  # Search original invoice
  │   └── DocumentTypeSelector.tsx   # Doc type radio/dropdown
  └── hooks/
      ├── useAutoFillClient.ts       # Auto-fill based on doc type
      ├── useGSTCalculation.ts       # GST calc logic
      ├── useSupplyTypeDetection.ts  # Intra/Inter detection
      └── useInvoiceLinker.ts        # Link CN/DN to invoice
```

---

## Validation Rules

### For Credit/Debit Notes:
1. ✅ Must link to an existing invoice
2. ✅ Party details must match original invoice
3. ✅ Amount cannot exceed original invoice amount
4. ✅ Reason field is mandatory
5. ✅ Same GST rate as original invoice (recommended)

### For All Documents:
1. ✅ Supplier and Recipient must have different GSTINs
2. ✅ At least one line item required
3. ✅ All line items must have: Description, Quantity > 0, Rate > 0
4. ✅ Invoice number must be unique
5. ✅ Date cannot be in future

---

## API Payload Structure

```typescript
interface CreateInvoicePayload {
  clientId: string
  docType: DocType
  docNumber: string
  docDate: string
  financialYear: string
  
  // Party details
  supplier: PartyDetails
  recipient: PartyDetails
  
  // For CN/DN
  originalInvoiceId?: string
  originalDocNumber?: string
  reason?: string
  
  // Supply details
  supplyType: 'intra_state' | 'inter_state'
  placeOfSupply: string
  reverseCharge: boolean
  itcEligible: boolean
  
  // Line items
  lines: LineItem[]
  
  // Tax calculation
  taxable: number
  cgst: number
  sgst: number
  igst: number
  cess: number
  total: number
  
  // Metadata
  attachment?: File
}
```

---

## User Flow Examples

### Example 1: Purchase Invoice
1. Click "Create Invoice"
2. Select Client: "GUNJAN ENTERPRISES"
   - System auto-fills as Recipient (Bill To)
3. Select Doc Type: "Purchase Invoice"
4. Enter Vendor (Bill From):
   - Name: "Maharashtra State Power"
   - GSTIN: 27AAECM2935R1ZV
   - System detects: Intra-State (both MH-27)
5. Add line items, select GST rate
6. System calculates CGST+SGST
7. Save → Done!

### Example 2: Credit Note Received (Purchase Return)
1. Click "Create Invoice"
2. Select Client: "GUNJAN ENTERPRISES"
   - System auto-fills as Recipient (Bill To)
3. Select Doc Type: "Credit Note Received"
4. Search Original Invoice: Type "INV-2024-123"
   - System shows matching purchase invoices
   - Select invoice
   - Vendor details auto-fill from original invoice
5. Enter Reason: "Damaged goods returned"
6. Line items pre-filled from original (negative quantities)
7. System calculates refund amount
8. Save → Done!

### Example 3: Sales Invoice
1. Click "Create Invoice"
2. Select Client: "GUNJAN ENTERPRISES"
   - System auto-fills as Supplier (Bill From)
3. Select Doc Type: "Sales Invoice"
4. Enter Customer (Bill To):
   - Name: "ABC Corporation"
   - GSTIN: 09ABCDE1234F1Z5 (UP)
   - System detects: Inter-State (MH-27 to UP-09)
5. Add line items, select GST rate
6. System calculates IGST only
7. Save → Done!

---

## Next Steps

1. Create new menu item "Create Invoice"
2. Build BillingScreen component
3. Implement InvoiceForm with all document types
4. Add auto-fill logic for each type
5. Build invoice search/linker for CN/DN
6. Integrate with existing API
7. Add comprehensive validation
8. Test all 6 document types

**Ready to implement?** I'll start building the feature now!
