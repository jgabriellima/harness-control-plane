#!/usr/bin/env python3
"""Tests for harness index sync (JAMBU-110 AC-6)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BIN_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from plane_ticket_state import format_harness_index_comment  # noqa: E402
from sdlc_dsl_bindings import manifest_sync_harness_fields  # noqa: E402
from work_items_sync import (  # noqa: E402
    apply_harness_fields_to_ticket,
    build_harness_fields,
    continuity_status_for_manifest,
    sync_ticket_harness,
)


def _sample_manifest(run_id: str = "goal-run-1") -> dict:
    return {
        "metadata": {"run_id": run_id, "workflow_id": "goal-flow"},
        "status": "awaiting_human",
        "continuity": {
            "awaiting": "approval",
            "blocked_by_node": "pr-merge",
        },
        "nodes": {
            "spec-phase": {"status": "completed"},
            "pr-merge": {"status": "awaiting_approval"},
        },
    }


def test_manifest_sync_harness_fields_from_plane_yaml() -> None:
    fields = manifest_sync_harness_fields(REPO_ROOT)
    assert "harness_run_id" in fields
    assert "continuity_status" in fields


def test_build_harness_fields_uses_child_run_id() -> None:
    manifest = _sample_manifest()
    ticket = {"child_run_id": "feature-run-9", "parent_run_id": "goal-run-1"}
    fields = build_harness_fields("goal-run-1", manifest, ticket)
    assert fields["harness_run_id"] == "feature-run-9"
    assert fields["harness_parent_run_id"] == "goal-run-1"
    assert fields["harness_workflow_id"] == "goal-flow"
    assert fields["harness_node_id"] == "pr-merge"
    assert fields["continuity_status"] == "approval"


def test_apply_harness_fields_writes_ticket_dict() -> None:
    manifest = _sample_manifest()
    ticket: dict = {"role": "vertical-slice"}
    apply_harness_fields_to_ticket("goal-run-1", manifest, ticket)
    assert ticket["harness_run_id"] == "goal-run-1"
    assert ticket["harness"]["workflow_id"] == "goal-flow"


def test_continuity_status_falls_back_to_run_status() -> None:
    manifest = {"status": "in_progress", "continuity": {"awaiting": "none"}}
    assert continuity_status_for_manifest(manifest) == "in_progress"


def test_harness_comment_contains_run_id_marker() -> None:
    fields = {
        "harness_run_id": "goal-run-1",
        "harness_workflow_id": "goal-flow",
        "harness_node_id": "spec-phase",
        "continuity_status": "none",
    }
    html = format_harness_index_comment(
        "JAMBU-110",
        fields,
        marker="<!-- sdlc-harness-index -->",
    )
    assert "harness_run_id" in html
    assert "goal-run-1" in html
    assert "<!-- sdlc-harness-index -->" in html


def test_sync_ticket_harness_dry_run() -> None:
    manifest = _sample_manifest()
    ticket = {"uuid": "00000000-0000-0000-0000-000000000001", "role": "vertical-slice"}
    with patch("plane_ticket_state.sync_harness_fields_to_plane") as mock_sync:
        mock_sync.return_value = {"dry_run": True}
        fields = sync_ticket_harness(
            "JAMBU-110",
            ticket,
            manifest,
            "goal-run-1",
            dry_run=True,
        )
        mock_sync.assert_called_once()
        assert fields["harness_run_id"] == "goal-run-1"
    assert ticket["harness_synced"] is False


def test_sync_ticket_harness_requires_uuid() -> None:
    manifest = _sample_manifest()
    ticket: dict = {"role": "vertical-slice"}
    with pytest.raises(RuntimeError, match="uuid not registered"):
        sync_ticket_harness("JAMBU-110", ticket, manifest, "goal-run-1")
