"""
Test script to verify the improved extraction prompt works
"""
import asyncio
import json
from openrouter_intel import llm_extract_document

# Sample OCR text from a typical Indian GST invoice
SAMPLE_INVOICE_TEXT = """
TAX INVOICE

BILL FROM:
GUNJAN ENTERPRISES
GSTIN: 27AZUPP2736R1Z7
Address: Maharashtra

BILL TO:
CLIENT NAME PVT LTD
GSTIN: 27AZUPP2736R1Z7
Place of Supply: Maharashtra (27)

Document Number: GNJ-2025-001
Document Date: 15-01-2025
Fiscal Year: 2025-26

ITEM DETAILS:
Sr. HSN/SAC  Description              Qty  UOM   Rate    Taxable  CGST(9%)  SGST(9%)  Total
1  9954     Consulting Services      10   Hrs   1000    10000    900       900       11800

Subtotal:           10000
CGST @ 9%:           900
SGST @ 9%:           900
------------------------
Grand Total:        11800
Amount in Words: Eleven Thousand Eight Hundred Only

Supply Type: Intra-state
Transaction Type: B2B
ITC: Yes
"""

async def test_extraction():
    print("Testing improved extraction prompt...")
    print("=" * 80)

    result, usage = await llm_extract_document(
        SAMPLE_INVOICE_TEXT,
        doc_type_hint="purchase",
        client_gstin="27AZUPP2736R1Z7",
        client_name="CLIENT NAME PVT LTD"
    )

    print("\nExtraction Result:")
    print(json.dumps(result, indent=2))

    print("\n" + "=" * 80)
    print("Field Verification:")
    print("=" * 80)

    if result.get("purchaseBill"):
        pb = result["purchaseBill"]
        checks = {
            "billNumber": pb.get("billNumber"),
            "billDate": pb.get("billDate"),
            "vendorName": pb.get("vendorName"),
            "gstin": pb.get("gstin"),
            "destinationOfSupply": pb.get("destinationOfSupply"),
            "supplyType": pb.get("supplyType"),
            "subtotal": pb.get("subtotal"),
            "cgst": pb.get("cgst"),
            "sgst": pb.get("sgst"),
            "total": pb.get("total"),
        }

        for field, value in checks.items():
            status = "✓ FOUND" if value else "✗ MISSING"
            print(f"{status:12} {field:25} = {value}")

        # Check line items
        lines = pb.get("lines", [])
        print(f"\n{'✓ FOUND' if lines else '✗ MISSING':12} Line items count: {len(lines)}")
        if lines:
            line = lines[0]
            print(f"  - itemDescription: {line.get('itemDescription')}")
            print(f"  - hsnSac: {line.get('hsnSac')}")
            print(f"  - quantity: {line.get('quantity')}")
            print(f"  - rate: {line.get('rate')}")
            print(f"  - taxableValue: {line.get('taxableValue')}")

    print("\n" + "=" * 80)
    print("Token Usage:")
    print(f"  Model: {usage.get('model')}")
    print(f"  Prompt tokens: {usage.get('prompt_tokens')}")
    print(f"  Completion tokens: {usage.get('completion_tokens')}")
    print(f"  Cost: ${usage.get('cost_usd', 0):.4f}")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_extraction())
