"""ADR-026 acceptance tests — failure transitions and gate-driven loops.

Phase 1: _apply_on_failure + return_to_* / abort / warn_and_continue — DONE
Phase 2: RETRY without blocked in agent mode — DONE
Phase 3: feature-flow-complete → per-child required_actions — DONE
Phase 4: invoke.step loop inner subprocess retry — DONE
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BIN_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BIN_DIR.parents[1]
sys.path.insert(0, str(BIN_DIR))

from sdlc_workflow_gate import GateResult  # noqa: E402
from sdlc_workflow_manifest import (  # noqa: E402
    init_manifest,
    load_manifest,
    load_workflow_dsl,
    node_order_from_dsl,
    resolve_on_failure_target,
    save_manifest,
)


# --- Phase 1: unit contract for onFailure target resolution ---


def test_resolve_on_failure_target_implementation() -> None:
    assert resolve_on_failure_target("return_to_implementation", ["planning", "implementation"]) == "implementation"


def test_resolve_on_failure_target_fix_implementation() -> None:
    order = ["context-hydration", "fix-implementation", "qa"]
    assert resolve_on_failure_target("return_to_fix_implementation", order) == "fix-implementation"


def test_resolve_on_failure_target_context_hydration() -> None:
    assert resolve_on_failure_target("return_to_context_hydration", ["context-hydration", "planning"]) == "context-hydration"


def test_resolve_on_failure_target_abort_returns_none() -> None:
    assert resolve_on_failure_target("abort", ["planning"]) is None


# --- Phase 1: integration — return_to_implementation after review gate FAIL ---


def test_review_fail_return_to_implementation(tmp_path, monkeypatch) -> None:
    """feature-flow review FAIL must redo implementation and prescribe step on it."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")

    from sdlc_workflow_run import _apply_on_failure  # noqa: WPS433

    run_id = init_manifest("feature-flow", "ADR-026 phase1", None, "agent")
    manifest = load_manifest(run_id)
    dsl = load_workflow_dsl("feature-flow")
    review_spec = next(n for n in dsl["spec"]["nodes"] if n["id"] == "review")

    gate = GateResult("structured-output.pass", "FAIL", "review rejected")
    manifest = _apply_on_failure(manifest, dsl, "review", gate, review_spec)

    impl_state = manifest["nodes"]["implementation"]
    review_state = manifest["nodes"]["review"]
    assert impl_state["status"] == "pending"
    assert review_state["status"] in ("pending", "failed", "retry")
    assert manifest["status"] == "in_progress"

    actions = manifest["continuity"]["required_actions"]
    assert any("implementation" in str(a.get("description", "")) for a in actions)
    assert any("step" in str(a.get("command", "")) for a in actions)


def test_on_failure_abort_blocks_run(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    from sdlc_workflow_run import _apply_on_failure  # noqa: WPS433

    run_id = init_manifest("spec-flow", "ADR-026 abort", None, "agent")
    manifest = load_manifest(run_id)
    dsl = load_workflow_dsl("spec-flow")
    node_spec = dsl["spec"]["nodes"][0]
    node_id = node_spec["id"]

    gate = GateResult("structured-output.pass", "FAIL", "hard stop")
    manifest = _apply_on_failure(manifest, dsl, node_id, gate, node_spec)

    assert manifest["status"] == "blocked"
    assert manifest["nodes"][node_id]["status"] == "failed"


def test_warn_and_continue_advances_node(tmp_path, monkeypatch) -> None:
    """feature-flow work-item-closure: gate FAIL logged but node completes."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    from sdlc_workflow_run import _apply_on_failure  # noqa: WPS433

    run_id = init_manifest("feature-flow", "ADR-026 warn", None, "agent")
    manifest = load_manifest(run_id)
    dsl = load_workflow_dsl("feature-flow")
    node_with_warn = next(
        n for n in dsl["spec"]["nodes"] if (n.get("control") or {}).get("onFailure") == "warn_and_continue"
    )
    node_id = node_with_warn["id"]

    gate = GateResult("delivery-complete.pass", "FAIL", "non-blocking drift")
    manifest = _apply_on_failure(manifest, dsl, node_id, gate, node_with_warn)

    assert manifest["nodes"][node_id]["status"] == "completed"
    assert manifest["status"] == "in_progress"


# --- Phase 2: RETRY must not block run when fix_and_retry ---


def test_gate_retry_fix_and_retry_keeps_run_in_progress(tmp_path, monkeypatch) -> None:
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    from sdlc_workflow_run import _apply_on_failure  # noqa: WPS433

    run_id = init_manifest("bootstrap-flow", "ADR-026 retry", None, "agent")
    manifest = load_manifest(run_id)
    dsl = load_workflow_dsl("bootstrap-flow")
    doctor = next(n for n in dsl["spec"]["nodes"] if n["id"] == "doctor-validation")

    gate = GateResult("doctor-pass.pass", "RETRY", "doctor checks failed — fix env")
    manifest = _apply_on_failure(manifest, dsl, "doctor-validation", gate, doctor)

    assert manifest["status"] == "in_progress"
    assert manifest["nodes"]["doctor-validation"]["status"] == "retry"
    hints = manifest["continuity"].get("resume_hints") or []
    assert any("doctor" in h.lower() or "fix" in h.lower() for h in hints)


def test_cmd_step_retry_does_not_set_blocked(tmp_path, monkeypatch) -> None:
    """cmd_step agent mode: RETRY outcome must not terminal-block the run."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")

    run_id = init_manifest("bootstrap-flow", "ADR-026 step retry", None, "agent")
    dsl = load_workflow_dsl("bootstrap-flow")
    order = node_order_from_dsl(dsl)
    doctor_idx = order.index("doctor-validation")

    manifest = load_manifest(run_id)
    for nid in order[:doctor_idx]:
        manifest["nodes"][nid]["status"] = "completed"
        manifest["nodes"][nid]["gate_outcome"] = "PASS"
    manifest["nodes"]["doctor-validation"] = {
        "id": "doctor-validation",
        "status": "retry",
        "gate_outcome": "RETRY",
    }
    manifest["status"] = "in_progress"
    save_manifest(run_id, manifest)

    from sdlc_workflow_run import _handle_composite_gate_failure  # noqa: WPS433

    attempt = {"count": 0}

    def fake_execute(
        run_id_arg: str,
        manifest_arg,
        dsl_arg,
        node_id: str,
        mode: str,
        max_retries: int = 3,
    ) -> str:
        del manifest_arg, mode, max_retries
        attempt["count"] += 1
        if attempt["count"] >= 2:
            manifest_local = load_manifest(run_id_arg)
            manifest_local["nodes"]["doctor-validation"]["status"] = "completed"
            manifest_local["nodes"]["doctor-validation"]["gate_outcome"] = "PASS"
            save_manifest(run_id_arg, manifest_local)
            return "PASS"
        doctor_spec = next(n for n in dsl_arg["spec"]["nodes"] if n["id"] == "doctor-validation")
        gate = GateResult("doctor-pass.pass", "RETRY", "doctor checks failed — fix env")
        return _handle_composite_gate_failure(
            run_id_arg, load_manifest(run_id_arg), dsl_arg, node_id, gate, doctor_spec
        )

    monkeypatch.setattr("sdlc_workflow_run._execute_composite_node", fake_execute)

    from sdlc_workflow_run import cmd_step  # noqa: WPS433

    rc = cmd_step(run_id, "agent", max_retries=3)
    manifest = load_manifest(run_id)
    assert rc == 1, "first step must delegate to agent (no infinite recursion)"
    assert manifest["status"] == "in_progress"
    assert manifest["status"] != "blocked"

    rc2 = cmd_step(run_id, "agent", max_retries=3)
    manifest = load_manifest(run_id)
    assert manifest["status"] != "blocked", f"second step returned {rc2}"
    assert manifest["nodes"]["doctor-validation"]["status"] == "completed"


# --- Phase 3: feature-flow-complete → child step commands ---


def test_feature_flow_complete_fail_emits_child_commands(tmp_path, monkeypatch) -> None:
    """goal-flow execution FAIL must list step command per incomplete child."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)

    from sdlc_workflow_run import _sync_execution_reconcile_actions  # noqa: WPS433

    parent_run_id = "goal-test-adr026"
    child_a = f"{parent_run_id}-ff-ticket-a"
    child_b = f"{parent_run_id}-ff-ticket-b"

    init_manifest("goal-flow", "ADR-026 fanout", parent_run_id, "agent")
    manifest = load_manifest(parent_run_id)
    manifest["tickets"] = {
        "ticket-a": {"child_run_id": child_a, "role": "slice"},
        "ticket-b": {"child_run_id": child_b, "role": "slice"},
    }
    manifest["nodes"]["execution"] = {"id": "execution", "status": "retry", "gate_outcome": "FAIL"}
    manifest["status"] = "in_progress"
    save_manifest(parent_run_id, manifest)

    dsl = load_workflow_dsl("goal-flow")
    _sync_execution_reconcile_actions(manifest, dsl)

    actions = manifest["continuity"]["required_actions"]
    commands = [a.get("command", "") for a in actions if a.get("type") == "command"]
    assert any(child_a in c for c in commands), commands
    assert any(child_b in c for c in commands), commands
    assert manifest["status"] == "in_progress"


def test_feature_flow_complete_skips_completed_child(tmp_path, monkeypatch) -> None:
    """Completed child runs must not appear in required_actions."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)

    from sdlc_workflow_manifest import init_manifest, load_manifest, save_manifest  # noqa: WPS433
    from sdlc_workflow_run import _sync_execution_reconcile_actions  # noqa: WPS433

    parent_run_id = "goal-completed-child-adr026"
    child_done = f"{parent_run_id}-ff-proj-1"
    child_open = f"{parent_run_id}-ff-proj-2"

    init_manifest("goal-flow", "completed child filter", parent_run_id, "agent")
    manifest = load_manifest(parent_run_id)
    manifest["tickets"] = {
        "PROJ-1": {"child_run_id": child_done, "role": "slice", "feature_flow_complete": True},
        "PROJ-2": {"child_run_id": child_open, "role": "slice"},
    }
    manifest["nodes"]["execution"] = {"id": "execution", "status": "retry", "gate_outcome": "FAIL"}
    save_manifest(parent_run_id, manifest)

    for child_id, status in ((child_done, "completed"), (child_open, "in_progress")):
        init_manifest("feature-flow", f"child {child_id}", child_id, "agent")
        child_manifest = load_manifest(child_id)
        child_manifest["status"] = status
        save_manifest(child_id, child_manifest)

    dsl = load_workflow_dsl("goal-flow")
    _sync_execution_reconcile_actions(manifest, dsl)

    commands = [
        a.get("command", "")
        for a in manifest["continuity"]["required_actions"]
        if a.get("type") == "command"
    ]
    assert not any(child_done in c for c in commands), commands
    assert any(child_open in c for c in commands), commands


def test_feature_flow_complete_metrics_drive_action_count() -> None:
    """GateResult.metrics.child_run_ids maps to required_actions commands."""
    from sdlc_workflow_run import _actions_from_feature_flow_gate  # noqa: WPS433

    parent_run_id = "goal-metrics-adr026"
    metrics = {
        "incomplete": [
            "ticket-a: child run goal-metrics-adr026-ff-ticket-a status='in_progress'",
            "ticket-b: no child feature-flow run — dispatch execution node first",
        ],
        "child_run_ids": [
            "goal-metrics-adr026-ff-ticket-a",
        ],
    }
    gate = GateResult(
        "feature-flow-complete.pass",
        "FAIL",
        "; ".join(metrics["incomplete"]),
        metrics=metrics,
    )
    actions = _actions_from_feature_flow_gate(parent_run_id, gate)
    command_actions = [a for a in actions if a.get("type") == "command"]
    assert len(command_actions) >= 1
    assert all("step --run-id" in a["command"] for a in command_actions)


def test_cmd_step_execution_fanout_returns_delegate_not_loop(tmp_path, monkeypatch) -> None:
    """goal-flow execution FAIL must return exit 1 with child commands — never spin."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    parent_run_id = "goal-loop-guard-adr026"
    child_a = f"{parent_run_id}-ff-ticket-a"
    init_manifest("goal-flow", "ADR-026 loop guard", parent_run_id, "agent")
    manifest = load_manifest(parent_run_id)
    dsl = load_workflow_dsl("goal-flow")
    order = node_order_from_dsl(dsl)
    exec_idx = order.index("execution")
    for nid in order[:exec_idx]:
        manifest["nodes"][nid]["status"] = "completed"
        manifest["nodes"][nid]["gate_outcome"] = "PASS"
    manifest["tickets"] = {
        "ticket-a": {"child_run_id": child_a, "role": "slice"},
    }
    save_manifest(parent_run_id, manifest)

    calls = {"count": 0}

    def fake_execute(
        run_id_arg: str,
        manifest_arg,
        dsl_arg,
        node_id: str,
        mode: str,
        max_retries: int = 3,
    ) -> str:
        del manifest_arg, mode, max_retries
        calls["count"] += 1
        assert node_id == "execution"
        from sdlc_workflow_run import _handle_composite_gate_failure  # noqa: WPS433

        exec_spec = next(n for n in dsl_arg["spec"]["nodes"] if n["id"] == "execution")
        gate = GateResult(
            "feature-flow-complete.pass",
            "FAIL",
            f"child {child_a} incomplete",
            metrics={"child_run_ids": [child_a], "incomplete": [f"ticket-a: child {child_a}"]},
        )
        return _handle_composite_gate_failure(
            run_id_arg, load_manifest(run_id_arg), dsl_arg, node_id, gate, exec_spec
        )

    monkeypatch.setattr("sdlc_workflow_run._execute_composite_node", fake_execute)

    from sdlc_workflow_run import cmd_step  # noqa: WPS433

    rc = cmd_step(parent_run_id, "agent", max_retries=3)
    manifest = load_manifest(parent_run_id)

    assert calls["count"] == 1, "must not re-execute execution node in a spin"
    assert rc == 1
    assert manifest["status"] == "in_progress"
    actions = manifest["continuity"]["required_actions"]
    commands = [a.get("command", "") for a in actions if a.get("type") == "command"]
    assert any(child_a in c for c in commands), commands


def test_fanout_retry_limit_blocks_parent_run(tmp_path, monkeypatch) -> None:
    """After max_fanout_retries delegate attempts, parent run must block."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    from sdlc_workflow_run import _apply_on_failure  # noqa: WPS433

    parent_run_id = "goal-fanout-cap-adr026"
    dsl = load_workflow_dsl("goal-flow")
    exec_spec = next(n for n in dsl["spec"]["nodes"] if n["id"] == "execution")
    init_manifest("goal-flow", "fanout cap", parent_run_id, "agent")
    manifest = load_manifest(parent_run_id)
    manifest["protocol"] = {"step_delegate_attempts": {"execution": 11}}
    manifest["tickets"] = {"t-a": {"child_run_id": f"{parent_run_id}-ff-t-a", "role": "slice"}}
    save_manifest(parent_run_id, manifest)

    gate = GateResult("feature-flow-complete.pass", "FAIL", "children incomplete")
    manifest = _apply_on_failure(manifest, dsl, "execution", gate, exec_spec)

    assert manifest["status"] == "blocked"
    assert manifest["nodes"]["execution"]["status"] == "failed"


# --- Phase 4: inner subprocess loop (invoke.step: loop) ---


def test_inner_loop_subprocess_fix_and_retry(tmp_path, monkeypatch) -> None:
    """doctor-validation with step:loop retries subprocess inline before failing out."""
    runs = tmp_path / "workflow-runs"
    runs.mkdir()
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOW_RUNS_DIR", runs)
    monkeypatch.setattr("sdlc_workflow_manifest.ACTIVE_WORKFLOW_RUN_POINTER", runs / "ACTIVE")
    monkeypatch.setattr("sdlc_workflow_manifest.REPO_ROOT", tmp_path)
    monkeypatch.setattr("sdlc_workflow_manifest.WORKFLOWS_DIR", REPO_ROOT / ".sdlc" / "workflows")
    monkeypatch.setattr("sdlc_workflow_run.REPO_ROOT", tmp_path)

    from sdlc_workflow_gate import build_node_output  # noqa: WPS433
    from sdlc_workflow_run import cmd_step, execute_condition  # noqa: WPS433

    run_id = init_manifest("bootstrap-flow", "ADR-026 phase4", None, "agent")
    dsl = load_workflow_dsl("bootstrap-flow")
    order = node_order_from_dsl(dsl)
    doctor_idx = order.index("doctor-validation")

    manifest = load_manifest(run_id)
    for nid in order[:doctor_idx]:
        manifest["nodes"][nid]["status"] = "completed"
        manifest["nodes"][nid]["gate_outcome"] = "PASS"
    save_manifest(run_id, manifest)

    attempt = {"count": 0}
    real_execute_condition = execute_condition

    def fake_invoke(invoke_spec, ctx, mode):  # noqa: ANN001
        del invoke_spec, mode
        attempt["count"] += 1
        return build_node_output(
            ctx.node_id,
            ctx.run_id,
            f"doctor attempt {attempt['count']}",
            "script.inline",
            "PASS",
            "",
        )

    def fake_execute_condition(post, ctx):  # noqa: ANN001
        if ctx.node_id == "doctor-validation" and attempt["count"] <= 1:
            return GateResult("doctor-pass.pass", "RETRY", "transient doctor error")
        if ctx.node_id == "doctor-validation":
            return GateResult("doctor-pass.pass", "PASS", "doctor structural PASS")
        return real_execute_condition(post, ctx)

    monkeypatch.setattr("sdlc_workflow_run.invoke_function", fake_invoke)
    monkeypatch.setattr("sdlc_workflow_run.execute_condition", fake_execute_condition)

    rc = cmd_step(run_id, "agent", max_retries=3)
    manifest = load_manifest(run_id)
    doctor = manifest["nodes"]["doctor-validation"]
    assert doctor["status"] == "completed"
    assert doctor["gate_outcome"] == "PASS"
    assert attempt["count"] == 2
    assert manifest["status"] != "blocked"
    assert rc in (0, 42)


# --- Regression: existing continuity tests must keep passing after impl ---


def test_phase0_gate_passed_is_strictly_pass() -> None:
    """GateResult.passed remains binary; RETRY loops use onFailure / retry-allowed gates."""
    assert GateResult("g", "PASS", "").passed is True
    assert GateResult("g", "RETRY", "").passed is False
    assert GateResult("g", "FAIL", "").passed is False
