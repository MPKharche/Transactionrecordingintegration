from invoice_split import detect_invoice_segments, _document_number


def test_single_page_one_segment():
    pages = [{"page": 1, "text": "TAX INVOICE\nBill From\nGSTIN 27AAECM2935R1ZV\nDocument Number 26105ASH00121"}]
    segs = detect_invoice_segments(pages)
    assert len(segs) == 1
    assert segs[0]["pageStart"] == 1
    assert segs[0]["pageEnd"] == 1
    assert segs[0]["billNumber"] == "26105ASH00121"


def test_two_pages_two_invoices():
    pages = [
        {
            "page": 1,
            "text": "TAX INVOICE\nBILL FROM\nGSTIN 27AAECM2935R1ZV\nDocument Number 26105ASH00121",
        },
        {
            "page": 2,
            "text": "TAX INVOICE\nBILL FROM\nGSTIN 27BBBBB0000B1Z1\nDocument Number 26105ASH00122",
        },
    ]
    segs = detect_invoice_segments(pages)
    assert len(segs) == 2
    assert segs[0]["pageStart"] == 1
    assert segs[1]["pageStart"] == 2


def test_single_invoice_two_gstins_does_not_split():
    """Supplier + buyer GSTIN on one page must not create a false split."""
    pages = [
        {
            "page": 1,
            "text": (
                "TAX INVOICE\nBILL FROM\n27AAECM2935R1ZV\n"
                "BILL TO\n27FNZPP3642G1Z9\nDocument Number 26105ASH00121\n"
                "Document Discount\nDocument Value"
            ),
        },
    ]
    segs = detect_invoice_segments(pages)
    assert len(segs) == 1
    assert segs[0]["billNumber"] == "26105ASH00121"


def test_continuation_page_merges_without_doc_number():
    pages = [
        {
            "page": 1,
            "text": "TAX INVOICE\nBILL FROM\nDocument Number 26105ASH00121",
        },
        {
            "page": 2,
            "text": "Line items continued\nHSN 26271000\nTotal 1000",
        },
    ]
    segs = detect_invoice_segments(pages)
    assert len(segs) == 1
    assert segs[0]["pageEnd"] == 2


def test_rejects_discount_as_bill_number():
    assert _document_number("Document Discount\nDocument Value") == ""
