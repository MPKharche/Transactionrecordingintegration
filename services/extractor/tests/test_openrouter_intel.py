"""Tests for OpenRouter intellectual layer (mocked HTTP)."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from openrouter_intel import llm_detect_segments, openrouter_only


@pytest.mark.asyncio
async def test_llm_detect_segments_parses_json():
    fake = {
        "segments": [
            {"pageStart": 1, "pageEnd": 1, "billNumber": "26105ASHOO121", "confidence": "high"},
            {"pageStart": 2, "pageEnd": 3, "billNumber": "2SIOSASHO13B6", "confidence": "high"},
        ]
    }

    with patch("openrouter_intel.openrouter_chat", new=AsyncMock(return_value=fake)):
        pages = [
            {"page": 1, "text": "TAX INVOICE BILL FROM Document Number 26105ASHOO121"},
            {"page": 2, "text": "TAX INVOICE Document Number 2SIOSASHO13B6 continued"},
            {"page": 3, "text": "line items page 3"},
        ]
        segs = await llm_detect_segments(pages)
        assert len(segs) == 2
        assert segs[0]["billNumber"] == "26105ASHOO121"
        assert segs[1]["pageEnd"] == 3


def test_openrouter_only_defaults_when_key_set(monkeypatch):
    monkeypatch.delenv("EXTRACT_USE_OPENROUTER_ONLY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    assert openrouter_only() is True

    monkeypatch.setenv("EXTRACT_USE_OPENROUTER_ONLY", "false")
    assert openrouter_only() is False
