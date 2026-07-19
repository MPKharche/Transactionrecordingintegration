"""
Intelligent GST Validation using Claude via CC-Vibe
Handles complex logic like intra-state vs inter-state detection, field inference, etc.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, TypedDict

import httpx

log = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514")


class ClaudeUsageMeta(TypedDict):
    model: str
    input_tokens: int
    output_tokens: int


VALIDATION_PROMPT = """You are an expert Indian GST tax consultant. Given extracted invoice data, validate and intelligently fill missing fields.

**Your tasks:**
1. Validate supply_type (intra_state vs inter_state):
   - Compare supplier state code and recipient state code
   - Same state = intra_state (use CGST+SGST)
   - Different states = inter_state (use IGST only)

2. Validate tax structure matches supply_type:
   - intra_state: MUST have CGST+SGST, IGST should be 0
   - inter_state: MUST have IGST only, CGST+SGST should be 0

3. Intelligently infer missing fields:
   - If supply_type is wrong, correct it based on state codes
   - If placeOfSupply is missing, infer from recipient state
   - If tax structure is wrong, suggest corrections

4. Validate GSTIN format (15 characters, first 2 = state code)

5. Check for common errors:
   - Document number missing
   - Date format issues
   - Tax calculation mismatches
   - HSN/SAC code validity

Return ONLY valid JSON with this structure:
{
  "isValid": true/false,
  "correctedSupplyType": "intra_state" | "inter_state" | null,
  "corrections": {
    "placeOfSupply": "state code if missing",
    "sourceOfSupply": "supplier state if missing",
    "destinationOfSupply": "recipient state if missing"
  },
  "issues": [
    {
      "field": "field_name",
      "severity": "error" | "warning",
      "message": "description",
      "suggestedFix": "what to do"
    }
  ],
  "confidence": 0-100
}

**IMPORTANT GST Rules:**
- State codes: 01=Jammu Kashmir, 09=Uttar Pradesh, 27=Maharashtra, etc.
- GSTIN format: 2-digit state + 10-digit PAN + entity code + Z + checksum
- Intra-state (same state): CGST + SGST (usually 9% + 9% = 18% total)
- Inter-state (different states): IGST only (usually 18%)
- Tax slabs: 0%, 5%, 12%, 18%, 28%
"""


async def claude_validate(
    extracted_data: dict[str, Any],
    *,
    temperature: float = 0.1
) -> tuple[dict[str, Any], ClaudeUsageMeta]:
    """Use Claude to intelligently validate and correct GST document data."""

    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not configured for Claude validation")

    # Prepare the data summary for Claude
    user_content = f"""Extracted GST Document Data:

**Document Info:**
- Doc Type: {extracted_data.get('docType', 'unknown')}
- Doc Number: {extracted_data.get('purchaseBill', {}).get('billNumber', 'N/A')}
- Doc Date: {extracted_data.get('purchaseBill', {}).get('billDate', 'N/A')}

**Supplier (BILL FROM):**
- Name: {extracted_data.get('purchaseBill', {}).get('vendorName', 'N/A')}
- GSTIN: {extracted_data.get('purchaseBill', {}).get('gstin', 'N/A')}
- State Code: {(extracted_data.get('purchaseBill', {}).get('gstin', '')[:2]) if extracted_data.get('purchaseBill', {}).get('gstin') else 'N/A'}

**Recipient (BILL TO):**
- Name: {extracted_data.get('purchaseBill', {}).get('customerName', 'N/A')}
- GSTIN: {extracted_data.get('purchaseBill', {}).get('customerGstin', 'N/A')}
- State Code: {(extracted_data.get('purchaseBill', {}).get('customerGstin', '')[:2]) if extracted_data.get('purchaseBill', {}).get('customerGstin') else 'N/A'}

**Supply Info:**
- Supply Type: {extracted_data.get('purchaseBill', {}).get('supplyType', 'N/A')}
- Source of Supply: {extracted_data.get('purchaseBill', {}).get('sourceOfSupply', 'N/A')}
- Destination of Supply: {extracted_data.get('purchaseBill', {}).get('destinationOfSupply', 'N/A')}

**Tax Amounts:**
- Subtotal/Taxable: {extracted_data.get('purchaseBill', {}).get('subtotal', 'N/A')}
- CGST: {extracted_data.get('purchaseBill', {}).get('cgst', 'N/A')} (Rate: {extracted_data.get('purchaseBill', {}).get('cgstRate', 'N/A')}%)
- SGST: {extracted_data.get('purchaseBill', {}).get('sgst', 'N/A')} (Rate: {extracted_data.get('purchaseBill', {}).get('sgstRate', 'N/A')}%)
- IGST: {extracted_data.get('purchaseBill', {}).get('igst', 'N/A')} (Rate: {extracted_data.get('purchaseBill', {}).get('igstRate', 'N/A')}%)
- Total: {extracted_data.get('purchaseBill', {}).get('total', 'N/A')}

Validate this data and return corrections in the specified JSON format."""

    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 2048,
        "temperature": temperature,
        "system": VALIDATION_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": user_content
            }
        ]
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{ANTHROPIC_BASE_URL}/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        body = resp.json()

        # Extract content from Claude response
        content = body["content"][0]["text"]
        usage = body.get("usage", {})

    usage_meta: ClaudeUsageMeta = {
        "model": CLAUDE_MODEL,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }

    # Parse JSON response
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        raise ValueError("Claude did not return valid JSON")

    return json.loads(match.group()), usage_meta


async def apply_claude_corrections(
    extracted_data: dict[str, Any]
) -> dict[str, Any]:
    """
    Run Claude validation and apply corrections to extracted data.
    Returns corrected data with Claude's intelligent fixes applied.
    """

    try:
        validation_result, usage = await claude_validate(extracted_data)

        log.info(
            f"Claude validation: {usage['input_tokens']} in, {usage['output_tokens']} out"
        )

        # Apply corrections if Claude found issues
        if not validation_result.get("isValid", True):
            corrections = validation_result.get("corrections", {})

            # Apply supply type correction
            corrected_supply = validation_result.get("correctedSupplyType")
            if corrected_supply and extracted_data.get("purchaseBill"):
                log.info(
                    f"Claude corrected supply_type: "
                    f"{extracted_data['purchaseBill'].get('supplyType')} → {corrected_supply}"
                )
                extracted_data["purchaseBill"]["supplyType"] = corrected_supply

            # Apply field corrections
            if extracted_data.get("purchaseBill"):
                for field, value in corrections.items():
                    if value:
                        old_value = extracted_data["purchaseBill"].get(field)
                        extracted_data["purchaseBill"][field] = value
                        log.info(f"Claude corrected {field}: {old_value} → {value}")

            # Add Claude's issues to the extraction issues
            claude_issues = validation_result.get("issues", [])
            if claude_issues:
                existing_issues = extracted_data.get("issues", [])
                extracted_data["issues"] = existing_issues + [
                    f"[Claude] {issue.get('message', '')} (fix: {issue.get('suggestedFix', 'N/A')})"
                    for issue in claude_issues
                ]

        # Add metadata about Claude validation
        extracted_data["claudeValidation"] = {
            "validated": True,
            "confidence": validation_result.get("confidence", 0),
            "correctionsMade": not validation_result.get("isValid", True),
            "model": usage["model"],
        }

        return extracted_data

    except Exception as e:
        log.error(f"Claude validation failed: {e}")
        # Return original data if validation fails
        extracted_data["claudeValidation"] = {
            "validated": False,
            "error": str(e),
        }
        return extracted_data
