#!/usr/bin/env node
/**
 * Minimal extractor sidecar for Playwright CI — returns a valid purchase_bill payload
 * so the worker pipeline reaches ready_for_review without Python/OpenRouter.
 */
import http from "node:http";

const port = Number(process.env.EXTRACTOR_STUB_PORT ?? "8011");
const host = process.env.EXTRACTOR_STUB_HOST ?? "127.0.0.1";

const stubExtract = {
  docType: "purchase_bill",
  confidence: "low",
  extractionMethod: "e2e-stub",
  issues: [],
  purchaseBill: {
    vendorName: "E2E Stub Vendor",
    billNumber: "E2E-STUB-001",
    billDate: "2025-04-15",
    sourceOfSupply: "27",
    destinationOfSupply: "27",
    lines: [{ itemName: "Stub line", quantity: "1", rate: "100.00", hsnSac: "1234" }],
  },
};

const server = http.createServer(async (req, res) => {
  const url = req.url?.split("?")[0] ?? "";

  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ invoice2data: false, openrouter: false, stub: true }));
    return;
  }

  if (req.method === "POST" && url === "/detect-invoices") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ segments: [{ pageStart: 1, pageEnd: 1 }] }));
    return;
  }

  if (req.method === "POST" && (url === "/extract" || url.endsWith("/extract"))) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stubExtract));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(port, host, () => {
  console.log(`[extractor-stub] http://${host}:${port}`);
});
