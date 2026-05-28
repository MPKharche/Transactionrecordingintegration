"""One-off: fetch PDF from MinIO and print text extraction stats."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from minio_fetch import fetch_object
from extractor_core import extract_document_text, HAS_PYMUPDF, HAS_TESSERACT

path = sys.argv[1] if len(sys.argv) > 1 else ""
if not path:
    print("usage: test_extract_local.py <storage_path>")
    sys.exit(1)

os.environ.setdefault("MINIO_ENDPOINT", "localhost")
os.environ.setdefault("MINIO_PORT", "9000")
os.environ.setdefault("MINIO_BUCKET", "ca-uploads")

data = fetch_object(path)
print("bytes", len(data) if data else 0, "pymupdf", HAS_PYMUPDF, "tesseract", HAS_TESSERACT)
if not data:
    sys.exit(2)
text, method = extract_document_text(data, "application/pdf", path)
print("method", method, "len", len(text))
print(text[:1200] if text else "(empty)")
