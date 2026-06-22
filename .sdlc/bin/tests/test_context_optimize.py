"""Tests for sdlc_context_optimize.py and bracket_compress.py."""

from __future__ import annotations

import sys
from pathlib import Path

BIN = Path(__file__).resolve().parents[1]
if str(BIN) not in sys.path:
    sys.path.insert(0, str(BIN))

from bracket_compress import compress_text, convert_markdown_tables  # noqa: E402
from sdlc_context_optimize import (  # noqa: E402
    _extract_status,
    audit_index_sections,
    parse_index_sections,
    rebuild_index,
)


def test_convert_markdown_table_to_bracket() -> None:
    src = """## Stack

| Layer | Technology |
|---|---|
| Framework | Astro |
"""
    out = convert_markdown_tables(src)
    assert "[STACK]" in out
    assert "Framework→Astro" in out or "framework→Astro" in out.lower()


def test_extract_status_from_index_line() -> None:
    assert _extract_status("JAMBU-1 ticket=X status=merged pr=1") == "merged"
    assert _extract_status("foo stage=complete") == "complete"


def test_audit_index_sections_flags_terminal() -> None:
    sections = {
        "ACTIVE_WORK": [
            "A status=complete",
            "B status=in_progress",
        ],
        "ENTRY_POINTS": ["x→y"],
    }
    budget = {
        "index_section_limits": {"ACTIVE_WORK": 6},
        "terminal_statuses": ["complete", "done"],
    }
    findings = audit_index_sections(sections, budget)
    assert any(f["section"] == "ACTIVE_WORK" and f["archivable_terminal"] == 1 for f in findings)


def test_rebuild_index_preserves_structure() -> None:
    text = "[ACTIVE_WORK]\nline1\n[/ACTIVE_WORK]\n"
    sections = parse_index_sections(text)
    sections["ACTIVE_WORK"] = ["line2"]
    rebuilt = rebuild_index(text, sections)
    assert "line2" in rebuilt
    assert "line1" not in rebuilt


def test_compress_text_reduces_table_tokens() -> None:
    src = "| A | B |\n|---|---|\n| x | y |\n| p | q |\n"
    compressed = compress_text(src)
    assert "|" not in compressed or compressed.count("|") < src.count("|")
