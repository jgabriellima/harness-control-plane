"""ADR-020 Phase 2 — workflow continuity and HITL node contract tests."""
from __future__ import annotations

import io
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BIN_DIR.parents[1]
sys.path.insert(0, str(BIN_DIR))

from sdlc_workflow_gate import GateResult, gate_result_wait  # noqa: E402
from sdlc_workflow_manifest import (  # noqa: E402
    cmd_node_redo,
    default_continuity,
    default_node_shell,
    init_manifest,
    load_manifest,
    manifest_path,
    node_order_from_dsl,
    save_manifest,
    set_node_awaiting_human,
    sync_continuity_from_nodes,
)
from sdlc_workflow_run import _apply_gate_wait, cmd_status, materialize_node_emits  # noqa: E402
from sdlc_ref_resolver import RunContext  # noqa: E402


@pytest.fixture
def incident_run(tmp_path, monkeypatch):
    """Isolated workflow-runs dir with a minimal incident-flow manifest."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")

    run_id = init_manifest("incident-flow", "continuity test", None, "stub")
    return run_id


def test_init_manifest_includes_continuity(incident_run: str) -> None:
    manifest = load_manifest(incident_run)
    continuity = manifest.get("continuity")
    assert isinstance(continuity, dict)
    assert continuity.get("awaiting") == "none"
    assert continuity.get("blocked_by_node") is None
    first_node = manifest["nodes"]["ingestion"]
    assert first_node.get("artifacts") == {}
    assert first_node.get("hitl") is None


def test_set_node_awaiting_human(incident_run: str) -> None:
    set_node_awaiting_human(
        incident_run,
        "ingestion",
        hitl_kind="approval",
        reason="Approve incident ingestion",
        resume_gate="gates/schema-valid.pass",
        gate_id="gates/schema-valid.pass",
    )
    manifest = load_manifest(incident_run)
    state = manifest["nodes"]["ingestion"]
    assert state["status"] == "awaiting_approval"
    assert state["gate_outcome"] == "WAIT"
    assert manifest["status"] == "awaiting_human"
    continuity = manifest["continuity"]
    assert continuity["awaiting"] == "approval"
    assert continuity["blocked_by_node"] == "ingestion"
    assert len(continuity["required_actions"]) >= 1
    assert any(a.get("type") == "human" for a in continuity["required_actions"])


def test_apply_gate_wait_with_hitl(incident_run: str) -> None:
    from sdlc_workflow_manifest import load_workflow_dsl

    dsl = load_workflow_dsl("incident-flow")
    node_spec = next(n for n in dsl["spec"]["nodes"] if n["id"] == "ingestion")
    node_spec = dict(node_spec)
    node_spec["control"] = {
        "blocking": True,
        "hitl": {"kind": "approval", "reason": "Sign off ingestion"},
    }
    result = gate_result_wait("gates/test.pass", "approval", "waiting for approval")
    applied = _apply_gate_wait(incident_run, "ingestion", node_spec, result)
    assert applied is True
    manifest = load_manifest(incident_run)
    assert manifest["nodes"]["ingestion"]["status"] == "awaiting_approval"


def test_materialize_emits(incident_run: str) -> None:
    manifest = load_manifest(incident_run)
    node_spec = {
        "emits": [
            {"key": "pr_url", "from": "$node.output.structured.pr_url"},
            {"key": "spec_path", "from": "$node.output.structured.spec_path"},
        ],
    }
    node_output = {
        "structured": {
            "pr_url": "https://github.com/org/repo/pull/1",
            "spec_path": ".sdlc/specs/JAMBU-1.md",
        },
    }
    node_state = default_node_shell("pr-creation")
    ctx = RunContext(
        run_id=incident_run,
        intent="test",
        manifest=manifest,
        node_id="pr-creation",
        node_output=node_output,
    )
    materialize_node_emits(node_spec, node_output, node_state, ctx)
    assert node_state["artifacts"]["pr_url"] == "https://github.com/org/repo/pull/1"
    assert node_state["artifacts"]["spec_path"] == ".sdlc/specs/JAMBU-1.md"


def test_node_redo_resets_downstream(incident_run: str) -> None:
    manifest = load_manifest(incident_run)
    from sdlc_workflow_manifest import load_workflow_dsl

    dsl = load_workflow_dsl("incident-flow")
    order = node_order_from_dsl(dsl)
    for nid in order[:2]:
        manifest["nodes"][nid]["status"] = "completed"
    save_manifest(incident_run, manifest)

    cmd_node_redo(incident_run, order[1])
    manifest = load_manifest(incident_run)
    assert manifest["nodes"][order[0]]["status"] == "completed"
    for nid in order[1:]:
        assert manifest["nodes"][nid]["status"] == "pending"
    assert manifest["continuity"]["awaiting"] == "none"


def test_status_json_includes_continuity(incident_run: str) -> None:
    set_node_awaiting_human(
        incident_run,
        "ingestion",
        hitl_kind="approval",
        reason="status payload test",
    )
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = cmd_status(incident_run)
    assert rc == 0
    payload = json.loads(buf.getvalue())
    assert "continuity" in payload
    assert payload["continuity"]["awaiting"] == "approval"
    assert payload["nodes"]["ingestion"]["status"] == "awaiting_approval"


def test_default_node_shell_matches_valid_statuses() -> None:
    shell = default_node_shell("x")
    assert shell["status"] == "pending"
    assert default_continuity()["awaiting"] == "none"


def test_sync_continuity_clears_when_no_blocking(incident_run: str) -> None:
    manifest = load_manifest(incident_run)
    manifest["status"] = "awaiting_human"
    manifest["continuity"] = default_continuity()
    manifest["continuity"]["awaiting"] = "approval"
    sync_continuity_from_nodes(manifest, "incident-flow")
    assert manifest["continuity"]["awaiting"] == "none"
    assert manifest["status"] == "in_progress"
