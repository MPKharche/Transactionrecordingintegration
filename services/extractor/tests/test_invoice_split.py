from invoice_split import detect_invoice_segments


def test_single_page_one_segment():
    pages = [{"page": 1, "text": "TAX INVOICE\nBill From\nGSTIN 27AAECM2935R1ZV\nINV-001"}]
    segs = detect_invoice_segments(pages)
    assert len(segs) == 1
    assert segs[0]["pageStart"] == 1
    assert segs[0]["pageEnd"] == 1


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
    assert len(segs) >= 2
    assert segs[0]["pageStart"] == 1
    assert segs[1]["pageStart"] == 2
