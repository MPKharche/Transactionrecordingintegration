/**
 * Minimal 2-page PDF for multi-invoice pipeline tests (text-only, no OCR).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "../tests/fixtures/two-invoices.pdf");

const page1 = `BT /F1 12 Tf 50 700 Td (TAX INVOICE INV-001 PAGE1) Tj ET`;
const page2 = `BT /F1 12 Tf 50 700 Td (TAX INVOICE INV-002 PAGE2) Tj ET`;

function pageStream(content) {
  return `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`;
}

const objs = [
  "%PDF-1.4",
  "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
  "2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj",
  "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> >> >>\nendobj",
  pageStream(page1),
  "5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 6 0 R >> >> >>\nendobj",
  pageStream(page2).replace("4 0 obj", "7 0 obj"),
  "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
  "xref",
  "0 8",
  "0000000000 65535 f ",
  "trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n0\n%%EOF",
];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, objs.join("\n"));
console.log("Wrote", out);
