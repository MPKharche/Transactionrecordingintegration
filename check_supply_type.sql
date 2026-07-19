-- Check the actual extracted data for this document
SELECT
  id,
  doc_number,
  supplier->>'gstin' as supplier_gstin,
  supplier->>'state_code' as supplier_state,
  recipient->>'gstin' as recipient_gstin,
  recipient->>'state_code' as recipient_state,
  place_of_supply,
  supply_type,
  cgst,
  sgst,
  igst
FROM gst_documents
WHERE doc_number = '2510SASHOO737'
ORDER BY recorded_at DESC
LIMIT 1;
