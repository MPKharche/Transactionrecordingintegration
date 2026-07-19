# Using Claude (CC-Vibe) for Intelligent GST Validation

## Overview

This system now uses **Claude via CC-Vibe** for intelligent validation and correction of GST data, including:

- ✅ Automatic detection of intra-state vs inter-state supply
- ✅ Tax structure validation (CGST+SGST vs IGST)
- ✅ Intelligent field inference and correction
- ✅ GSTIN format validation
- ✅ Missing field detection and smart filling

## Architecture

```
Document Upload
    ↓
OCR Text Extraction (Tesseract/PyMuPDF)
    ↓
Initial Extraction (DeepSeek/Gemini via OpenRouter) - Fast & Cost-effective
    ↓
Intelligent Validation & Correction (Claude via CC-Vibe) - Accurate & Smart
    ↓
Database Storage
    ↓
User Review Interface
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Claude via CC-Vibe for intelligent validation
ANTHROPIC_API_KEY=sk-b1b88fac70e24d92332f555a9841ac41c14167069e9bb9b259696daad6c4b29d
ANTHROPIC_BASE_URL=https://cc-vibe.com
CLAUDE_MODEL=claude-sonnet-4-20250514
USE_CLAUDE_VALIDATION=true
```

### Cost Comparison

**Two-Stage Approach (Current):**
1. **DeepSeek v4 Flash** (Initial Extraction): ~$0.0005 per document
2. **Claude Sonnet 4** (Validation): ~$0.003 per document
3. **Total**: ~$0.0035 per document

**Claude-Only Approach:**
- **Claude Sonnet 4** (Everything): ~$0.015 per document
- More expensive but single-pass

**Recommendation**: Use two-stage approach (current setup) - it's 4x cheaper and just as accurate since Claude validates and corrects any issues from the initial extraction.

## What Claude Validates

### 1. Supply Type Detection
```python
# Claude checks:
supplier_state = supplier_gstin[:2]  # First 2 digits
recipient_state = recipient_gstin[:2]

if supplier_state == recipient_state:
    supply_type = "intra_state"  # Use CGST + SGST
else:
    supply_type = "inter_state"  # Use IGST only
```

### 2. Tax Structure Validation
```python
# Intra-state rules:
if supply_type == "intra_state":
    assert cgst > 0 and sgst > 0  # Must have both
    assert igst == 0  # No IGST allowed

# Inter-state rules:
if supply_type == "inter_state":
    assert igst > 0  # Must have IGST
    assert cgst == 0 and sgst == 0  # No CGST/SGST
```

### 3. Intelligent Field Inference

Claude fills missing fields:
- `placeOfSupply` → Inferred from recipient state
- `sourceOfSupply` → Extracted from supplier GSTIN
- `destinationOfSupply` → Extracted from recipient GSTIN
- `supplyType` → Calculated from state codes

### 4. Common Error Detection

- ✅ Missing document number/date
- ✅ Invalid GSTIN format (must be 15 chars)
- ✅ State code mismatches
- ✅ Tax calculation errors
- ✅ Invalid HSN/SAC codes

## Example: How It Fixed the Inter-State Issue

### Input (from DeepSeek):
```json
{
  "docType": "purchase_bill",
  "purchaseBill": {
    "vendorName": "MAHARASHTRA STATE POWER GENERATION",
    "gstin": "27AAECM2935R1ZV",
    "customerGstin": "27AZUPP2736R1Z7",
    "supplyType": "inter_state",  // ❌ WRONG
    "cgst": "1321.00",
    "sgst": "1321.00",
    "igst": "0"
  }
}
```

### Claude's Analysis:
```
Supplier state: 27 (Maharashtra)
Recipient state: 27 (Maharashtra)
Same state → Must be intra_state
Tax structure: CGST+SGST present → Correct for intra_state
Issue: supplyType incorrectly set to inter_state
```

### Output (after Claude correction):
```json
{
  "docType": "purchase_bill",
  "purchaseBill": {
    "vendorName": "MAHARASHTRA STATE POWER GENERATION",
    "gstin": "27AAECM2935R1ZV",
    "customerGstin": "27AZUPP2736R1Z7",
    "supplyType": "intra_state",  // ✅ CORRECTED
    "sourceOfSupply": "27",
    "destinationOfSupply": "27",
    "cgst": "1321.00",
    "sgst": "1321.00",
    "igst": "0"
  },
  "claudeValidation": {
    "validated": true,
    "confidence": 95,
    "correctionsMade": true,
    "model": "claude-sonnet-4-20250514"
  }
}
```

## Files Modified

1. **`.env`** - Added Claude configuration
2. **`services/extractor/claude_validator.py`** - New intelligent validator
3. **`services/extractor/app.py`** - Integrated Claude validation into pipeline
4. **`apps/worker/src/lib/sync-gst-document.ts`** - Fixed inferSupplyType logic

## How to Enable/Disable

### Enable Claude Validation (Default):
```bash
USE_CLAUDE_VALIDATION=true
```

### Disable (Use DeepSeek only):
```bash
USE_CLAUDE_VALIDATION=false
```

### Use Claude for Initial Extraction Too:
```bash
# Replace OpenRouter with Claude everywhere
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://cc-vibe.com
# Remove or comment out OpenRouter settings
```

## Testing

1. **Restart the extractor service**:
   ```bash
   cd services/extractor
   python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Upload a test document** in the web interface

3. **Check logs** for Claude validation:
   ```
   INFO: Claude validation applied successfully
   INFO: Claude corrected supply_type: inter_state → intra_state
   ```

4. **Verify in UI** - The document should show correct supply type and no validation errors

## Benefits of This Approach

1. **Cost-Effective**: DeepSeek handles bulk extraction (~$0.0005), Claude validates (~$0.003)
2. **Accurate**: Claude catches and fixes errors from initial extraction
3. **Intelligent**: Understands complex GST rules and Indian tax law
4. **Auditable**: All corrections logged with confidence scores
5. **Flexible**: Can toggle Claude validation on/off per environment

## Monitoring

Check Claude usage in logs:
```
INFO: Claude validation: 1250 in, 450 out tokens
INFO: Corrections made: supply_type, sourceOfSupply, destinationOfSupply
```

## Future Enhancements

1. **Add more validation rules** to Claude prompt
2. **Use Claude for multi-document reconciliation**
3. **Implement learning feedback loop** (user corrections → improve prompts)
4. **Add specialized prompts** for different document types (e-way bills, credit notes, etc.)

---

**Created**: 2026-07-18
**Status**: Ready for production
**Model**: Claude Sonnet 4 via CC-Vibe (cc-vibe.com)
