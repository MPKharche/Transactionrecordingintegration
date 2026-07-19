-- Fix incorrect supply_type for documents where both parties are in the same state
UPDATE gst_documents
SET supply_type = 'intra_state'
WHERE supply_type = 'inter_state'
  AND (supplier->>'state_code') = (recipient->>'state_code')
  AND (supplier->>'state_code') IS NOT NULL
  AND (recipient->>'state_code') IS NOT NULL
  AND (supplier->>'state_code') != '';

-- Show affected documents
SELECT
  doc_number,
  doc_type,
  supplier->>'state_code' as supplier_state,
  recipient->>'state_code' as recipient_state,
  supply_type,
  cgst,
  sgst,
  igst
FROM gst_documents
WHERE (supplier->>'state_code') = (recipient->>'state_code')
  AND (supplier->>'state_code') = '27'
ORDER BY recorded_at DESC
LIMIT 10;
