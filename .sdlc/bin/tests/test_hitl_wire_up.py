"""HITL wire-up tests — ADR-020 production workflow integration."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BIN_DIR.parents[1]
sys.path.insert(0, str(BIN_DIR))

from plane_ticket_state import format_hitl_intervention_comment  # noqa: E402
from sdlc_hitl_handoff import _select_hitl_sync_tickets, record_hitl_handoff  # noqa: E402
from sdlc_workflow_gate import check_pr_merged, gate_result_wait  # noqa: E402
from sdlc_workflow_manifest import (  # noqa: E402
    init_manifest,
    load_manifest,
    save_manifest,
    set_node_awaiting_human,
)
from sdlc_workflow_run import _apply_gate_wait, _node_hitl_spec  # noqa: E402
from sdlc_ref_resolver import RunContext  # noqa: E402


@pytest.fixture
def goal_run(tmp_path, monkeypatch):
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    sdlc_root = tmp_path / ".sdlc"
    (sdlc_root / "handoffs").mkdir(parents=True)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")
    monkeypatch.setattr("sdlc_workflow_manifest.SDLC_ROOT", sdlc_root)
    monkeypatch.setattr("sdlc_hitl_handoff.SDLC_ROOT", sdlc_root)

    run_id = init_manifest("goal-flow", "hitl wire-up test", None, "stub")
    manifest = load_manifest(run_id)
    manifest["tickets"] = {
        "JAMBU-EPIC": {
            "uuid": "00000000-0000-0000-0000-000000000001",
            "role": "epic",
            "status": "in_progress",
        },
        "JAMBU-123": {
            "uuid": "00000000-0000-0000-0000-000000000002",
            "role": "vertical-slice",
            "status": "in_progress",
            "pr_url": "https://github.com/jgabriellima/ai-native-sdlc/pull/99",
        },
    }
    save_manifest(run_id, manifest)
    return run_id


def test_goal_flow_pr_creation_has_hitl_spec() -> None:
    from sdlc_workflow_manifest import load_workflow_dsl

    dsl = load_workflow_dsl("goal-flow")
    node = next(n for n in dsl["spec"]["nodes"] if n["id"] == "pr-creation")
    hitl = _node_hitl_spec(node)
    assert hitl is not None
    assert hitl.get("kind") == "approval"
    assert hitl.get("resumeGate") == "gates/pr-merged.pass"


def test_set_node_awaiting_human_writes_latest_handoff(goal_run: str, tmp_path) -> None:
    set_node_awaiting_human(
        goal_run,
        "pr-creation",
        hitl_kind="approval",
        reason="Merge PR before integration",
        resume_gate="gates/pr-merged.pass",
    )
    latest_path = tmp_path / ".sdlc" / "handoffs" / "LATEST.md"
    assert latest_path.is_file()
    content = latest_path.read_text(encoding="utf-8")
    assert goal_run in content
    assert "pr-creation" in content
    assert "AWAITING_HUMAN" in content


def test_record_hitl_handoff_contains_continuity(goal_run: str) -> None:
    manifest = load_manifest(goal_run)
    manifest["status"] = "awaiting_human"
    manifest["continuity"]["blocked_by_node"] = "pr-creation"
    path = record_hitl_handoff(goal_run, manifest)
    text = path.read_text(encoding="utf-8")
    assert goal_run in text
    assert "pr-creation" in text


def test_apply_gate_wait_goal_flow_pr_creation(goal_run: str) -> None:
    from sdlc_workflow_manifest import load_workflow_dsl

    dsl = load_workflow_dsl("goal-flow")
    node_spec = next(n for n in dsl["spec"]["nodes"] if n["id"] == "pr-creation")
    result = gate_result_wait("gates/pr-merged.pass", "approval", "waiting for merge")
    applied = _apply_gate_wait(goal_run, "pr-creation", node_spec, result)
    assert applied is True
    manifest = load_manifest(goal_run)
    assert manifest["status"] == "awaiting_human"
    assert manifest["nodes"]["pr-creation"]["status"] == "awaiting_approval"


def test_select_hitl_sync_tickets_epic_and_slice(goal_run: str) -> None:
    manifest = load_manifest(goal_run)
    selected = _select_hitl_sync_tickets(manifest)
    ids = [tid for tid, _ in selected]
    assert "JAMBU-EPIC" in ids
    assert "JAMBU-123" in ids
    assert len(selected) == 2


def test_check_pr_merged_stub_mode_passes(goal_run: str) -> None:
    manifest = load_manifest(goal_run)
    ctx = RunContext(
        run_id=goal_run,
        intent="test",
        manifest=manifest,
        node_id="pr-creation",
        execution_mode="stub",
    )
    result = check_pr_merged(ctx)
    assert result.outcome == "PASS"


def test_check_pr_merged_wait_when_open(goal_run: str, monkeypatch) -> None:
    manifest = load_manifest(goal_run)
    ctx = RunContext(
        run_id=goal_run,
        intent="test",
        manifest=manifest,
        node_id="pr-creation",
        execution_mode="agent",
    )
    monkeypatch.setattr(
        "sdlc_workflow_gate._gh_pr_is_merged",
        lambda _url: False,
    )
    result = check_pr_merged(ctx)
    assert result.outcome == "WAIT"
    assert result.hitl_kind == "approval"


def test_format_hitl_intervention_comment() -> None:
    html = format_hitl_intervention_comment(
        "JAMBU-123",
        {
            "harness_run_id": "goal-run-1",
            "harness_node_id": "pr-creation",
            "blocked_by_node": "pr-creation",
            "awaiting": "approval",
            "reason": "Merge PR",
            "required_actions": "[]",
        },
        marker="<!-- sdlc-harness-index -->",
    )
    assert "HITL Intervention" in html
    assert "pr-creation" in html
    assert "Merge PR" in html


def test_hitl_ticket_sync_on_pause(goal_run: str) -> None:
    from sdlc_hitl_handoff import sync_hitl_tickets_on_pause

    manifest = load_manifest(goal_run)
    set_node_awaiting_human(
        goal_run,
        "pr-creation",
        hitl_kind="approval",
        reason="Sync test",
    )
    manifest = load_manifest(goal_run)

    with patch("work_items_sync.sync_manifest_ticket") as mock_sync:
        sync_hitl_tickets_on_pause(goal_run, manifest)
        assert mock_sync.call_count == 2
        statuses = [call[0][2] for call in mock_sync.call_args_list]
        assert statuses == ["ready_for_review", "ready_for_review"]
