from gst_heuristic import heuristic_extract
from extractor_core import extract_document_text
from pathlib import Path


def test_heuristic_mahagenco_page():
    data = Path(r"c:\Users\mayur\Downloads\siddhivinayak Invoice-1.pdf").read_bytes()
    text, _ = extract_document_text(data, "application/pdf", "test.pdf", 1, 1)
    result = heuristic_extract(text, "purchase_invoice")
    assert result is not None
    assert result["docType"] == "purchase_bill"
    bill = result["purchaseBill"]
    assert bill["billNumber"] == "26105ASHOO121"
    assert bill["gstin"].startswith("27")
    assert "SIDDHIVINAYAK" in bill["customerName"].upper() or bill["customerName"]
