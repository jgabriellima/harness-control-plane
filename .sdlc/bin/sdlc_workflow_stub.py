#!/usr/bin/env python3
"""Minimal stub cognitive output for SDLC command invoke in stub mode."""
from __future__ import annotations

from typing import Any

from sdlc_workflow_gate import build_node_output


def build_stub_cognitive_output(
    node_id: str,
    run_id: str,
    ref: str = "",
) -> dict[str, Any]:
    summary = f"stub output for {node_id}"
    if ref:
        summary = f"{summary} ({ref})"
    return build_node_output(
        node_id,
        run_id,
        summary,
        "structured-output.pass",
        "PASS",
        summary,
        structured={"branch": node_id.replace("-", "."), "enterpriseArtifacts": []},
    )
