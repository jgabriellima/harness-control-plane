#!/usr/bin/env python3
"""
SDLC workflow orchestrator — composite nodes only, idempotent resume.

Usage (from repo root):
  python3 .sdlc/bin/sdlc_workflow_run.py run --workflow incident-flow --intent "P2 login regression"
  python3 .sdlc/bin/sdlc_workflow_run.py resume --run-id run-...
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import BIN_DIR, REPO_ROOT, SDLC_ROOT, workflow_runtime_limits

sys.path.insert(0, str(BIN_DIR))

from sdlc_gate_executor import execute_condition  # noqa: E402
from sdlc_invoke import invoke_function  # noqa: E402
from sdlc_ref_resolver import RunContext, resolve_ref  # noqa: E402
from sdlc_workflow_gate import GateResult, build_node_output, check_delivery_complete  # noqa: E402
from sdlc_workflow_manifest import (  # noqa: E402
    AWAITING_NODE_STATUSES,
    cmd_node_complete,
    cmd_node_redo,
    cmd_node_start,
    default_continuity,
    default_node_shell,
    init_manifest,
    load_manifest,
    load_workflow_dsl,
    manifest_path,
    node_order_from_dsl,
    reset_nodes_from,
    resolve_on_failure_target,
    save_manifest,
    set_active,
    set_node_awaiting_human,
    sync_continuity_from_nodes,
    workflow_requires_delivery_bundle,
)


def _output_dir(manifest: dict[str, Any]) -> Path:
    rel = manifest.get("paths", {}).get("output_dir", "")
    return (REPO_ROOT / rel).resolve()


def _cognitive_path(output: Path, node_id: str) -> Path:
    return output / "cognitive" / f"{node_id}.json"


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _gate_record(node_id: str, run_id: str, result: GateResult) -> dict[str, Any]:
    structured = {"metrics": result.metrics} if result.metrics else {}
    return build_node_output(
        node_id,
        run_id,
        result.message,
        result.gate_id,
        result.outcome,
        result.message,
        structured=structured,
    )


def _complete_node_with_output(
    run_id: str,
    manifest: dict[str, Any],
    node_id: str,
    record: dict[str, Any],
    gate_outcome: str,
    gate_id: str | None,
) -> None:
    output = _output_dir(manifest)
    _write_json(_cognitive_path(output, node_id), record)
    cmd_node_complete(run_id, node_id, gate_outcome, gate_id)


def _node_hitl_spec(node_spec: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(node_spec, dict):
        return None
    control = node_spec.get("control")
    if not isinstance(control, dict):
        return None
    hitl = control.get("hitl")
    return hitl if isinstance(hitl, dict) else None


def _apply_gate_wait(
    run_id: str,
    node_id: str,
    node_spec: dict[str, Any],
    result: GateResult,
) -> bool:
    """Map gate WAIT + control.hitl to awaiting_* node state. Returns True if HITL applied."""
    if result.outcome != "WAIT":
        return False
    hitl = _node_hitl_spec(node_spec)
    if not hitl:
        return False
    kind = str(hitl.get("kind", "input"))
    reason = str(hitl.get("reason") or result.message)
    resume_gate = hitl.get("resumeGate")
    resume_gate_str = resume_gate if isinstance(resume_gate, str) else None
    set_node_awaiting_human(
        run_id,
        node_id,
        hitl_kind=kind,
        reason=reason,
        resume_gate=resume_gate_str,
        gate_id=result.gate_id,
    )
    return True


def _on_failure_policy(node_spec: dict[str, Any]) -> str:
    control = node_spec.get("control")
    if not isinstance(control, dict):
        return "abort"
    policy = control.get("onFailure")
    return policy if isinstance(policy, str) and policy.strip() else "abort"


def _runner_step_action(run_id: str, target_node_id: str) -> dict[str, Any]:
    return {
        "id": f"runner-step-{target_node_id}",
        "type": "command",
        "command": (
            f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"
        ),
        "description": f"Advance workflow — next node {target_node_id}",
    }


RETRY_ALLOWED_GATE_IDS = frozenset(
    {
        "structured-output.pass",
        "schema-valid.pass",
    },
)


def _child_step_action(child_run_id: str, ticket_id: str | None = None) -> dict[str, Any]:
    label = f"{child_run_id} ({ticket_id})" if ticket_id else child_run_id
    return {
        "id": f"child-step-{child_run_id}",
        "type": "command",
        "command": (
            f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {child_run_id} --mode agent"
        ),
        "description": f"Advance feature-flow child run {label}",
    }


def _child_run_status(child_run_id: str) -> str | None:
    from sdlc_workflow_run_resolve import manifest_path  # noqa: WPS433

    path = manifest_path(child_run_id)
    if not path.is_file():
        return None
    try:
        import yaml
    except ImportError:
        return None
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        return None
    status = doc.get("status")
    return str(status) if status else None


def _ticket_needs_child_step(parent_run_id: str, ticket_id: str, ticket: dict[str, Any]) -> bool:
    from sdlc_workflow_run_resolve import feature_flow_run_id  # noqa: WPS433

    if ticket.get("feature_flow_complete") is True:
        return False
    child_run_id = str(ticket.get("child_run_id") or feature_flow_run_id(parent_run_id, ticket_id))
    child_status = _child_run_status(child_run_id)
    return child_status != "completed"


def _actions_from_manifest_tickets(parent_run_id: str, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    from sdlc_workflow_run_resolve import feature_flow_run_id  # noqa: WPS433

    tickets = manifest.get("tickets") or {}
    actions: list[dict[str, Any]] = []
    for ticket_id, ticket in tickets.items():
        if not isinstance(ticket, dict):
            continue
        if ticket.get("role") in ("epic", "content-post"):
            continue
        if not _ticket_needs_child_step(parent_run_id, str(ticket_id), ticket):
            continue
        child_run_id = ticket.get("child_run_id") or feature_flow_run_id(parent_run_id, ticket_id)
        actions.append(_child_step_action(str(child_run_id), str(ticket_id)))
    return actions


def _actions_from_feature_flow_gate(
    parent_run_id: str,
    gate: GateResult,
    manifest: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Build per-child step commands from feature-flow-complete gate metrics (ADR-026 Phase 3)."""
    import re

    metrics = gate.metrics if isinstance(gate.metrics, dict) else {}
    child_run_ids = metrics.get("child_run_ids")
    if isinstance(child_run_ids, list) and child_run_ids:
        return [
            _child_step_action(str(cid))
            for cid in child_run_ids
            if cid and _child_run_status(str(cid)) != "completed"
        ]

    if manifest is not None:
        ticket_actions = _actions_from_manifest_tickets(parent_run_id, manifest)
        if ticket_actions:
            return ticket_actions

    found: list[str] = []
    incomplete = metrics.get("incomplete") or []
    for line in incomplete:
        for match in re.finditer(r"child run (\S+)", str(line)):
            found.append(match.group(1))
    return [_child_step_action(cid) for cid in found]


def _ticket_id_from_child_run_id(child_run_id: str) -> tuple[str, str] | None:
    """Parse (parent_run_id, ticket_id) from feature-flow child run id."""
    import re

    match = re.match(r"^(.+)-ff-(.+)$", child_run_id, re.I)
    if not match:
        return None
    parent_run_id, ticket_slug = match.group(1), match.group(2)
    try:
        parent = load_manifest(parent_run_id)
    except (FileNotFoundError, OSError, ValueError):
        return None
    tickets = parent.get("tickets") or {}
    if not isinstance(tickets, dict):
        return None
    for tid in tickets:
        if str(tid).lower() == ticket_slug.lower():
            return parent_run_id, str(tid)
    return parent_run_id, ticket_slug


def refresh_parent_child_actions(manifest: dict[str, Any]) -> None:
    """Rebuild continuity.required_actions from incomplete feature-flow children only."""
    run_id = str((manifest.get("metadata") or {}).get("run_id", ""))
    continuity = manifest.setdefault("continuity", default_continuity())
    actions = _actions_from_manifest_tickets(run_id, manifest)
    continuity["required_actions"] = actions
    continuity["blocked_by_node"] = None
    continuity["awaiting"] = "none"
    if actions:
        continuity["resume_hints"] = [
            f"feature-flow: {len(actions)} child run(s) still need step — parent must not re-step until complete",
        ]
    else:
        continuity["resume_hints"] = [
            "All feature-flow children completed — re-step parent goal run to advance execution gate",
        ]


def reconcile_parent_after_child_complete(child_run_id: str) -> dict[str, Any] | None:
    """When a feature-flow child completes, mark ticket and refresh parent required_actions."""
    from sdlc_workflow_run_resolve import run_metadata  # noqa: WPS433

    workflow_id, status = run_metadata(child_run_id)
    if workflow_id != "feature-flow" or status != "completed":
        return None

    parsed = _ticket_id_from_child_run_id(child_run_id)
    if not parsed:
        return None
    parent_run_id, ticket_id = parsed

    parent = load_manifest(parent_run_id)
    tickets = parent.get("tickets") or {}
    ticket = tickets.get(ticket_id)
    if not isinstance(ticket, dict):
        return None

    ticket["feature_flow_complete"] = True
    ticket["child_run_id"] = child_run_id
    refresh_parent_child_actions(parent)
    save_manifest(parent_run_id, parent)
    return parent


def _sync_execution_reconcile_actions(manifest: dict[str, Any], dsl: dict[str, Any]) -> None:
    """When goal-flow execution fails feature-flow-complete, prescribe child step commands."""
    run_id = str((manifest.get("metadata") or {}).get("run_id", ""))
    continuity = manifest.setdefault("continuity", default_continuity())
    actions = _actions_from_manifest_tickets(run_id, manifest)
    continuity["required_actions"] = actions
    continuity["blocked_by_node"] = None
    continuity["awaiting"] = "none"
    slice_tickets = [
        tid
        for tid, ticket in (manifest.get("tickets") or {}).items()
        if isinstance(ticket, dict) and ticket.get("role") not in ("epic", "content-post")
    ]
    continuity["resume_hints"] = [
        f"feature-flow-complete: {len(slice_tickets)} ticket(s) — "
        f"step each child run ({len(actions)} command(s) prescribed)",
    ]
    manifest["status"] = "in_progress"
    nodes = manifest.setdefault("nodes", {})
    execution = nodes.setdefault("execution", default_node_shell("execution"))
    if execution.get("gate_outcome") in ("FAIL", "RETRY", None):
        execution["status"] = "retry"
        if execution.get("gate_outcome") is None:
            execution["gate_outcome"] = "FAIL"


def _apply_on_failure(
    manifest: dict[str, Any],
    dsl: dict[str, Any],
    node_id: str,
    gate_result: GateResult,
    node_spec: dict[str, Any],
) -> dict[str, Any]:
    """Interpret control.onFailure after gate FAIL/RETRY (ADR-026 Phase 1)."""
    from datetime import datetime, timezone

    on_failure = _on_failure_policy(node_spec)
    order = node_order_from_dsl(dsl)
    run_id = str((manifest.get("metadata") or {}).get("run_id", ""))
    continuity = manifest.setdefault("continuity", default_continuity())
    nodes = manifest.setdefault("nodes", {})
    state = nodes.setdefault(node_id, default_node_shell(node_id))
    state["gate_outcome"] = gate_result.outcome
    state["failure_message"] = gate_result.message

    if on_failure == "warn_and_continue":
        state["status"] = "completed"
        state["gate_outcome"] = "PASS"
        state["warn_note"] = gate_result.message
        state["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        state["hitl"] = None
        manifest["status"] = "in_progress"
        continuity["awaiting"] = "none"
        continuity["blocked_by_node"] = None
        continuity["required_actions"] = []
        continuity["resume_hints"] = [f"warn_and_continue: {gate_result.message}"]
        return manifest

    if gate_result.gate_id == "feature-flow-complete.pass" and gate_result.outcome == "FAIL":
        limits = workflow_runtime_limits(dsl)
        protocol = manifest.setdefault("protocol", {})
        attempts = protocol.setdefault("step_delegate_attempts", {})
        attempt_count = int(attempts.get(node_id, 0)) + 1
        attempts[node_id] = attempt_count
        state["status"] = "retry"
        state["gate_outcome"] = "FAIL"
        continuity["awaiting"] = "none"
        continuity["blocked_by_node"] = None
        continuity["required_actions"] = _actions_from_feature_flow_gate(run_id, gate_result, manifest)
        metrics = gate_result.metrics if isinstance(gate_result.metrics, dict) else {}
        incomplete = metrics.get("incomplete") or []
        continuity["resume_hints"] = [
            f"feature-flow-complete FAIL: {gate_result.message}",
            *([f"pending: {line}" for line in incomplete[:3]]),
        ]
        if attempt_count >= limits["max_fanout_retries"]:
            state["status"] = "failed"
            manifest["status"] = "blocked"
            continuity["blocked_by_node"] = node_id
            continuity["required_actions"] = []
            continuity["resume_hints"].append(
                f"max_fanout_retries={limits['max_fanout_retries']} exceeded — "
                "complete child feature-flow runs before re-stepping parent",
            )
            return manifest
        manifest["status"] = "in_progress"
        continuity["resume_hints"].insert(
            0,
            f"delegate attempt {attempt_count}/{limits['max_fanout_retries']} — "
            "execute prescribed child step commands (do not re-step parent until children complete)",
        )
        return manifest

    if gate_result.outcome == "RETRY":
        retry_in_place = on_failure == "fix_and_retry" or (
            on_failure == "abort" and gate_result.gate_id in RETRY_ALLOWED_GATE_IDS
        )
        if retry_in_place:
            state["status"] = "retry"
            manifest["status"] = "in_progress"
            continuity["awaiting"] = "none"
            continuity["blocked_by_node"] = None
            continuity["required_actions"] = [_runner_step_action(run_id, node_id)]
            continuity["resume_hints"] = [gate_result.message]
            return manifest

    if on_failure == "escalate_to_architect":
        state["status"] = "awaiting_approval"
        state["gate_outcome"] = "WAIT"
        state["hitl"] = {
            "kind": "approval",
            "since": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "reason": gate_result.message,
            "resumeGate": None,
            "gate_id": gate_result.gate_id,
        }
        manifest["status"] = "awaiting_human"
        continuity["awaiting"] = "approval"
        continuity["blocked_by_node"] = node_id
        continuity["required_actions"] = [
            {
                "id": f"{node_id}-hitl",
                "type": "human",
                "description": gate_result.message,
            },
        ]
        continuity["resume_hints"] = [_runner_step_action(run_id, node_id)["command"]]
        return manifest

    if on_failure == "trigger_rollback":
        rollback_target = "production-deploy" if "production-deploy" in order else None
        if rollback_target is None:
            on_failure = "abort"
        else:
            reset_nodes_from(manifest, order, rollback_target)
            manifest["status"] = "in_progress"
            continuity["awaiting"] = "none"
            continuity["blocked_by_node"] = None
            continuity["required_actions"] = [_runner_step_action(run_id, rollback_target)]
            continuity["resume_hints"] = [f"trigger_rollback: {gate_result.message}"]
            return manifest

    return_target = resolve_on_failure_target(on_failure, order)
    if return_target is not None:
        reset_nodes_from(manifest, order, return_target)
        manifest["status"] = "in_progress"
        continuity["awaiting"] = "none"
        continuity["blocked_by_node"] = None
        continuity["required_actions"] = [_runner_step_action(run_id, return_target)]
        continuity["resume_hints"] = [f"{gate_result.gate_id}: {gate_result.message}"]
        return manifest

    state["status"] = "failed"
    state["hitl"] = None
    manifest["status"] = "blocked"
    continuity["awaiting"] = "none"
    continuity["blocked_by_node"] = node_id
    continuity["required_actions"] = []
    continuity["resume_hints"] = [gate_result.message]
    return manifest


def _gate_failure_outcome(
    manifest: dict[str, Any],
    gate_result: GateResult,
    node_spec: dict[str, Any],
) -> str:
    """Runner outcome after onFailure handling — PASS continues DAG, FAIL/RETRY blocks."""
    if _on_failure_policy(node_spec) == "warn_and_continue":
        return "PASS"
    if manifest.get("status") == "in_progress":
        return "TRANSITION"
    return gate_result.outcome if gate_result.outcome in ("FAIL", "RETRY") else "FAIL"


def _handle_composite_gate_failure(
    run_id: str,
    manifest: dict[str, Any],
    dsl: dict[str, Any],
    node_id: str,
    gate_result: GateResult,
    node_spec: dict[str, Any],
) -> str:
    record = _gate_record(node_id, run_id, gate_result)
    _complete_node_with_output(run_id, manifest, node_id, record, gate_result.outcome, gate_result.gate_id)
    manifest = load_manifest(run_id)
    manifest = _apply_on_failure(manifest, dsl, node_id, gate_result, node_spec)
    save_manifest(run_id, manifest)
    return _gate_failure_outcome(manifest, gate_result, node_spec)


def materialize_node_emits(
    node_spec: dict[str, Any],
    node_output: dict[str, Any],
    node_state: dict[str, Any],
    ctx: RunContext,
) -> None:
    emits = node_spec.get("emits")
    if not isinstance(emits, list):
        return
    artifacts = node_state.setdefault("artifacts", {})
    for emit in emits:
        if not isinstance(emit, dict):
            continue
        key = emit.get("key")
        from_ref = emit.get("from")
        if not isinstance(key, str) or not isinstance(from_ref, str):
            continue
        try:
            value = resolve_ref(from_ref, ctx)
        except ValueError:
            continue
        if value is not None:
            artifacts[key] = value


def _resolve_run_mode(manifest: dict[str, Any]) -> str:
    mode = manifest.get("run_mode")
    if isinstance(mode, str) and mode.strip():
        return mode.strip()
    return "feature"


def _node_skip_for_mode(node_spec: dict[str, Any], run_mode: str) -> bool:
    control = node_spec.get("control") or {}
    skip_modes = control.get("skipInModes") or []
    return run_mode in skip_modes


def _mark_node_skipped(
    run_id: str,
    manifest: dict[str, Any],
    node_id: str,
    reason: str,
) -> None:
    from datetime import datetime, timezone

    nodes = manifest.setdefault("nodes", {})
    state = nodes.setdefault(node_id, {"id": node_id})
    state["status"] = "skipped"
    state["gate_outcome"] = "SKIP"
    state["skip_reason"] = reason
    if not state.get("completed_at"):
        state["completed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    save_manifest(run_id, manifest)


def _normalize_invalid_skip(run_id: str, manifest: dict[str, Any], node_id: str) -> None:
    """ADR-018: skipped + gate_outcome PASS is invalid — force re-execution."""
    state = (manifest.get("nodes") or {}).get(node_id, {})
    if state.get("status") == "skipped" and state.get("gate_outcome") != "SKIP":
        state["status"] = "pending"
        state["gate_outcome"] = None
        state.pop("skip_reason", None)
        save_manifest(run_id, manifest)


def _should_skip(manifest: dict[str, Any], node_id: str) -> bool:
    state = (manifest.get("nodes") or {}).get(node_id, {})
    if state.get("status") == "completed":
        return True
    if state.get("status") == "skipped" and state.get("gate_outcome") == "SKIP":
        return True
    return False


def _get_node_spec(dsl: dict[str, Any], node_id: str) -> dict[str, Any] | None:
    for node in dsl.get("spec", {}).get("nodes") or []:
        if node.get("id") == node_id:
            return node
    return None


def _is_composite_node(node: dict[str, Any] | None) -> bool:
    if not node:
        return False
    function = node.get("function")
    return isinstance(function, dict) and isinstance(function.get("invoke"), dict)


def _node_has_delivery_gate(node_spec: dict[str, Any]) -> bool:
    post = node_spec.get("postCondition")
    if not isinstance(post, dict):
        return False
    for check in post.get("checks") or []:
        if isinstance(check, dict) and "delivery-complete" in str(check.get("ref", "")):
            return True
    return False


def _load_prior_outputs(output: Path, manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    prior: dict[str, dict[str, Any]] = {}
    for nid, state in (manifest.get("nodes") or {}).items():
        if state.get("status") not in ("completed", "skipped"):
            continue
        path = _cognitive_path(output, nid)
        if path.is_file():
            prior[nid] = _load_json(path)
    return prior


def _write_delivery_bundle(run_id: str, manifest: dict[str, Any]) -> None:
    output = _output_dir(manifest)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id", "workflow")
    audit = manifest.get("audit") or {}

    run_manifest = {
        "apiVersion": "sdlc.jambu/v1",
        "kind": "RunOutput",
        "metadata": {
            "runId": run_id,
            "workflowId": workflow_id,
            "recordedAt": manifest.get("metadata", {}).get("updated_at"),
            "command": manifest.get("workflow", {}).get("command"),
        },
        "workflow": {"status": "completed", "intent": manifest.get("intent", "")},
        "outputs": {
            "manifest": "manifest.yaml",
            "consolidated": "consolidated.md",
            "assetsDir": "assets/",
            "cognitiveTracesDir": "cognitive/",
        },
        "auditMetrics": audit,
    }
    _write_json(output / "manifest.yaml", run_manifest)

    lines = [
        f"# Workflow run — {run_id}",
        "",
        f"Workflow: {workflow_id}",
        f"Intent: {manifest.get('intent', '')}",
        "",
    ]
    (output / "consolidated.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (output / "assets").mkdir(parents=True, exist_ok=True)


def _maybe_publish_deliverables(run_id: str, manifest: dict[str, Any]) -> None:
    from sdlc_deliverables_publish import publish_deliverables  # noqa: WPS433

    result = publish_deliverables(run_id, manifest, trigger="workflow")
    if not result.ok:
        raise RuntimeError(result.message)
    if not result.skipped:
        print(f"PUBLISH deliverables run={run_id} tickets={','.join(result.published_tickets) or 'none'}")


def _sync_trace_from_manifest(run_id: str, manifest: dict[str, Any]) -> None:
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id", "workflow")
    run_status = manifest.get("status", "in_progress")
    trace = {
        "apiVersion": "sdlc.jambu/v1",
        "kind": "WorkflowTrace",
        "metadata": {
            "runId": run_id,
            "workflowId": workflow_id,
            "recordedAt": manifest.get("metadata", {}).get("updated_at"),
        },
        "workflow": {"status": run_status, "intent": manifest.get("intent", "")},
        "state": {
            "workflowId": workflow_id,
            "runId": run_id,
            "status": run_status,
            "intent": manifest.get("intent", ""),
            "nodes": [
                {
                    "id": nid,
                    "status": state.get("status", "pending"),
                    "artifacts": [
                        {"name": state.get("content_ref", ""), "uri": state.get("content_ref", ""), "kind": "manifest"},
                    ]
                    if state.get("content_ref")
                    else [],
                }
                for nid, state in (manifest.get("nodes") or {}).items()
            ],
        },
    }
    trace_rel = manifest.get("paths", {}).get("trace_path", f".sdlc/workflow-runs/traces/{run_id}.yaml")
    trace_path = REPO_ROOT / trace_rel
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    with trace_path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(trace, handle, sort_keys=False)


def _invoke_uses_inner_loop(node_spec: dict[str, Any]) -> bool:
    invoke = node_spec.get("function", {}).get("invoke") or {}
    return str(invoke.get("step") or "") == "loop"


def _should_inner_loop_retry(
    node_spec: dict[str, Any],
    gate_result: GateResult,
    attempt: int,
    max_retries: int,
) -> bool:
    if attempt >= max_retries:
        return False
    if not _invoke_uses_inner_loop(node_spec):
        return False
    if _on_failure_policy(node_spec) != "fix_and_retry":
        return False
    return gate_result.outcome in ("FAIL", "RETRY")


def _execute_composite_node(
    run_id: str,
    manifest: dict[str, Any],
    dsl: dict[str, Any],
    node_id: str,
    mode: str,
    max_retries: int = 3,
) -> str:
    output = _output_dir(manifest)
    node_spec = _get_node_spec(dsl, node_id)
    if node_spec is None:
        return "FAIL"

    _normalize_invalid_skip(run_id, manifest, node_id)
    manifest = load_manifest(run_id)

    run_mode = _resolve_run_mode(manifest)
    if _node_skip_for_mode(node_spec, run_mode):
        _mark_node_skipped(run_id, manifest, node_id, f"skipInModes includes {run_mode!r}")
        print(f"NODE_SKIP {node_id} mode={run_mode} gate=SKIP")
        return "PASS"

    from sdlc_delivery import node_skip_for_delivery, sync_definition_of_done  # noqa: WPS433

    delivery_skip, delivery_reason = node_skip_for_delivery(node_spec, manifest)
    if delivery_skip:
        _mark_node_skipped(run_id, manifest, node_id, delivery_reason)
        sync_definition_of_done(manifest)
        save_manifest(run_id, manifest)
        print(f"NODE_SKIP {node_id} delivery gate=SKIP reason={delivery_reason}")
        return "PASS"

    if _should_skip(manifest, node_id):
        return "PASS"

    cmd_node_start(run_id, node_id)
    ctx = RunContext(
        run_id=run_id,
        intent=manifest.get("intent", ""),
        manifest=manifest,
        node_id=node_id,
        execution_mode=mode,
        prior_outputs=_load_prior_outputs(output, manifest),
        output_dir=output,
    )

    pre = node_spec.get("preCondition")
    if isinstance(pre, dict) and pre.get("checks"):
        pre_result = execute_condition(pre, ctx)
        if not pre_result.passed:
            if _apply_gate_wait(run_id, node_id, node_spec, pre_result):
                return "WAIT"
            return _handle_composite_gate_failure(
                run_id, manifest, dsl, node_id, pre_result, node_spec
            )

    inner_loop = _invoke_uses_inner_loop(node_spec) and _on_failure_policy(node_spec) == "fix_and_retry"
    attempt = 0
    gate_id = "structured-output.pass"
    gate_outcome = "PASS"
    node_output: dict[str, Any] = {}

    while True:
        invoke_spec = dict(node_spec["function"]["invoke"])
        if node_spec["function"].get("objective"):
            invoke_spec["objective"] = node_spec["function"]["objective"]
        node_output = invoke_function(invoke_spec, ctx, mode)
        ctx.node_output = node_output
        _write_json(_cognitive_path(output, node_id), node_output)

        structured = node_output.get("structured") if isinstance(node_output.get("structured"), dict) else {}
        inline_outcome = str(structured.get("gateOutcome") or "")
        if inline_outcome == "FAIL":
            gate_id = str(structured.get("gateId") or "script.inline")
            inline_result = GateResult(gate_id, "FAIL", str(node_output.get("summary", "inline FAIL")))
            if _should_inner_loop_retry(node_spec, inline_result, attempt, max_retries):
                attempt += 1
                print(
                    f"INNER_LOOP node={node_id} attempt={attempt}/{max_retries} "
                    f"gate={inline_result.gate_id} outcome={inline_result.outcome}",
                    file=sys.stderr,
                )
                continue
            return _handle_composite_gate_failure(
                run_id, manifest, dsl, node_id, inline_result, node_spec
            )

        post = node_spec.get("postCondition")
        gate_id = "structured-output.pass"
        gate_outcome = "PASS"
        if isinstance(post, dict) and post.get("checks"):
            post_result = execute_condition(post, ctx)
            gate_id = post_result.gate_id
            gate_outcome = post_result.outcome
            if not post_result.passed:
                if _apply_gate_wait(run_id, node_id, node_spec, post_result):
                    return "WAIT"
                if post_result.outcome != "WAIT":
                    if _should_inner_loop_retry(node_spec, post_result, attempt, max_retries):
                        attempt += 1
                        print(
                            f"INNER_LOOP node={node_id} attempt={attempt}/{max_retries} "
                            f"gate={post_result.gate_id} outcome={post_result.outcome}",
                            file=sys.stderr,
                        )
                        continue
                    return _handle_composite_gate_failure(
                        run_id, manifest, dsl, node_id, post_result, node_spec
                    )
        break

    if attempt > 0:
        print(f"INNER_LOOP node={node_id} resolved after {attempt + 1} attempt(s)", file=sys.stderr)

    manifest = load_manifest(run_id)
    node_state = (manifest.get("nodes") or {}).get(node_id, {})
    materialize_node_emits(node_spec, node_output, node_state, ctx)
    save_manifest(run_id, manifest)

    if _node_has_delivery_gate(node_spec):
        _write_delivery_bundle(run_id, manifest)
        _maybe_publish_deliverables(run_id, manifest)
        manifest = load_manifest(run_id)
        delivery = check_delivery_complete(
            _output_dir(manifest),
            manifest.get("nodes") or {},
            exclude_nodes=frozenset({node_id}),
        )
        if not delivery.passed:
            return _handle_composite_gate_failure(
                run_id, manifest, dsl, node_id, delivery, node_spec
            )
        manifest.setdefault("definition_of_done", {})["delivery_bundle_written"] = True
        manifest["status"] = "completed"
        save_manifest(run_id, manifest)

    record = build_node_output(
        node_id,
        run_id,
        node_output.get("summary", f"composite node {node_id}"),
        gate_id,
        gate_outcome,
        node_output.get("summary", "PASS"),
        structured=node_output.get("structured") if isinstance(node_output.get("structured"), dict) else {},
        confidence=float(node_output.get("confidence", 1.0)),
    )
    _complete_node_with_output(run_id, manifest, node_id, record, gate_outcome, gate_id)
    return gate_outcome if gate_outcome != "WAIT" else "PASS"


def _prior_nodes_incomplete(
    manifest: dict[str, Any],
    order: list[str],
    node_id: str,
) -> str | None:
    """Return error message when predecessors are not completed/skipped."""
    nodes = manifest.get("nodes") or {}
    for prior in order:
        if prior == node_id:
            break
        status = nodes.get(prior, {}).get("status", "pending")
        if status not in ("completed", "skipped"):
            return f"prior node {prior!r} status={status!r} (complete it before {node_id!r})"
    return None


def _validate_cognitive_identity(
    run_id: str,
    node_id: str,
    node_output: dict[str, Any],
) -> str | None:
    """Reject hand-written cognitive files that do not match the dispatched node/run."""
    doc_node = node_output.get("nodeId")
    if doc_node != node_id:
        return f"cognitive nodeId={doc_node!r} does not match --node {node_id!r}"
    doc_run = node_output.get("runId")
    if doc_run != run_id:
        return f"cognitive runId={doc_run!r} does not match --run-id {run_id!r}"
    if not node_output.get("recordedAt"):
        return "cognitive output missing recordedAt — regenerate via runner dispatch"
    return None


def _validate_submit_authority(
    manifest: dict[str, Any],
    order: list[str],
    node_id: str,
    node_output: dict[str, Any],
    run_id: str,
) -> str | None:
    """Submit is only legal after step exit 42 marked the node running."""
    prior_err = _prior_nodes_incomplete(manifest, order, node_id)
    if prior_err:
        return prior_err

    nodes = manifest.get("nodes") or {}
    state = nodes.get(node_id, {})
    status = state.get("status", "pending")
    if status == "completed":
        return f"node {node_id!r} already completed"
    if status != "running":
        return (
            f"node {node_id!r} status={status!r} — runner authority violated. "
            f"Run: python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent "
            f"(exit 42), then submit. Do not write cognitive/*.json without dispatch."
        )
    if not state.get("started_at"):
        return f"node {node_id!r} missing started_at — use step dispatch, not raw submit"

    running_nodes = [
        nid for nid in order if nodes.get(nid, {}).get("status") == "running"
    ]
    if len(running_nodes) > 1:
        return f"ambiguous submit: multiple running nodes {running_nodes}"

    return _validate_cognitive_identity(run_id, node_id, node_output)


def _find_next_node(manifest: dict[str, Any], order: list[str]) -> str | None:
    nodes = manifest.get("nodes") or {}
    for node_id in order:
        status = nodes.get(node_id, {}).get("status", "pending")
        if status in AWAITING_NODE_STATUSES:
            return node_id
        if status in ("pending", "retry", "failed", "running"):
            return node_id
    return None


def _sync_runner_required_actions(manifest: dict[str, Any], dsl: dict[str, Any]) -> None:
    """Materialize DSL agentPolicy into continuity.required_actions (deterministic, not chat)."""
    from sdlc_workflow_manifest import default_continuity  # noqa: WPS433

    continuity = manifest.setdefault("continuity", default_continuity())
    policy = _agent_policy_from_dsl(dsl)
    run_id = str((manifest.get("metadata") or {}).get("run_id", ""))

    if manifest.get("status") == "completed":
        actions: list[dict[str, Any]] = []
        for item in policy.get("onCompleteRequiredActions") or []:
            if not isinstance(item, dict):
                continue
            act = dict(item)
            cmd = act.get("command")
            if isinstance(cmd, str):
                act["command"] = cmd.replace("{run_id}", run_id)
            desc = act.get("description")
            if isinstance(desc, str):
                act["description"] = desc.replace("{run_id}", run_id)
            actions.append(act)
        continuity["required_actions"] = actions
        continuity["awaiting"] = "none"
        continuity["blocked_by_node"] = None
        return

    order = node_order_from_dsl(dsl)
    next_node = _find_next_node(manifest, order)
    workflow_id = str((manifest.get("metadata") or {}).get("workflow_id", ""))
    execution_state = (manifest.get("nodes") or {}).get("execution") or {}
    if (
        workflow_id == "goal-flow"
        and execution_state.get("status") in ("retry", "failed", "running")
        and execution_state.get("gate_outcome") in ("FAIL", "RETRY")
        and manifest.get("tickets")
    ):
        _sync_execution_reconcile_actions(manifest, dsl)
        return

    if next_node and manifest.get("status") in ("in_progress", "blocked", "awaiting_human"):
        continuity["required_actions"] = [
            {
                "id": "runner-step",
                "type": "command",
                "command": (
                    f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"
                ),
                "description": f"Advance workflow — next node {next_node}",
            },
        ]


def _status_payload(run_id: str, manifest: dict[str, Any], dsl: dict[str, Any]) -> dict[str, Any]:
    order = node_order_from_dsl(dsl)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id", "")
    sync_continuity_from_nodes(manifest, workflow_id if isinstance(workflow_id, str) else None)
    _sync_runner_required_actions(manifest, dsl)
    save_manifest(run_id, manifest)
    manifest = load_manifest(run_id)
    next_node = _find_next_node(manifest, order)
    nodes_summary: dict[str, Any] = {}
    for nid, state in (manifest.get("nodes") or {}).items():
        nodes_summary[nid] = {
            "status": state.get("status"),
            "gate_outcome": state.get("gate_outcome"),
            "artifacts": state.get("artifacts") or {},
        }
    continuity = manifest.get("continuity") or default_continuity()
    agent_policy = _agent_policy_from_dsl(dsl)
    payload: dict[str, Any] = {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "status": manifest.get("status"),
        "next_node": next_node,
        "intent": manifest.get("intent", ""),
        "output_dir": (manifest.get("paths") or {}).get("output_dir"),
        "continuity": continuity,
        "nodes": nodes_summary,
    }
    if agent_policy:
        payload["agentPolicy"] = agent_policy
    return payload


def _agent_policy_from_dsl(dsl: dict[str, Any]) -> dict[str, Any]:
    spec = dsl.get("spec") if isinstance(dsl.get("spec"), dict) else {}
    policy = spec.get("agentPolicy")
    return policy if isinstance(policy, dict) else {}


def _dispatch_payload(
    run_id: str,
    node_id: str,
    node_spec: dict[str, Any],
    manifest: dict[str, Any],
    dsl: dict[str, Any] | None = None,
) -> dict[str, Any]:
    invoke = node_spec.get("function", {}).get("invoke") or {}
    output = _output_dir(manifest)
    cognitive_path = str(_cognitive_path(output, node_id).relative_to(REPO_ROOT))
    payload: dict[str, Any] = {
        "action": "AGENT_DISPATCH",
        "run_id": run_id,
        "node_id": node_id,
        "invoke": invoke,
        "objective": node_spec.get("function", {}).get("objective", ""),
        "postCondition": node_spec.get("postCondition"),
        "cognitive_output_path": cognitive_path,
        "submit_command": (
            f"python3 .sdlc/bin/sdlc_workflow_run.py submit "
            f"--run-id {run_id} --node {node_id} --cognitive {cognitive_path}"
        ),
    }
    if dsl:
        policy = _agent_policy_from_dsl(dsl)
        if policy:
            payload["agentPolicy"] = policy
    return payload


def _requires_agent_dispatch(node_spec: dict[str, Any], mode: str) -> bool:
    if mode != "agent":
        return False
    invoke = node_spec.get("function", {}).get("invoke") or {}
    return str(invoke.get("type", "")) in ("command", "agent", "skill")


def cmd_status(run_id: str) -> int:
    manifest = load_manifest(run_id)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id", "")
    dsl = load_workflow_dsl(workflow_id) if workflow_id else {"spec": {"nodes": []}}
    payload = _status_payload(run_id, manifest, dsl)
    print(json.dumps(payload, indent=2))
    return 0


def _first_prescriptive_command(manifest: dict[str, Any]) -> str | None:
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    for act in continuity.get("required_actions") or []:
        if not isinstance(act, dict):
            continue
        if act.get("type") == "command" and isinstance(act.get("command"), str) and act["command"].strip():
            return act["command"].strip()
    return None


def _emit_step_delegate(run_id: str, dsl: dict[str, Any], node_id: str, outcome: str) -> int:
    """Return control to agent with continuity.required_actions — never recurse (ADR-026)."""
    manifest = load_manifest(run_id)
    payload = _status_payload(run_id, manifest, dsl)
    print(json.dumps(payload, indent=2))
    actions = (payload.get("continuity") or {}).get("required_actions") or []
    prescribed = _first_prescriptive_command(manifest)
    print(
        f"RUN DELEGATE node={node_id} outcome={outcome} "
        f"prescribed_actions={len(actions)}",
        file=sys.stderr,
    )
    if prescribed:
        print(f"RUN DELEGATE next_command={prescribed}", file=sys.stderr)
    return 1


def cmd_step(run_id: str, mode: str, max_retries: int) -> int:
    manifest = load_manifest(run_id)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    if not workflow_id:
        print("ERROR: manifest missing metadata.workflow_id", file=sys.stderr)
        return 1
    dsl = load_workflow_dsl(workflow_id)
    limits = workflow_runtime_limits(dsl)
    depth = 0

    while depth < limits["max_step_depth"]:
        manifest = load_manifest(run_id)
        order = node_order_from_dsl(dsl)
        next_node = _find_next_node(manifest, order)
        if next_node is not None:
            next_status = (manifest.get("nodes") or {}).get(next_node, {}).get("status")
            if next_status in AWAITING_NODE_STATUSES:
                payload = _status_payload(run_id, manifest, dsl)
                print(json.dumps(payload, indent=2))
                print(
                    f"RUN AWAITING_HUMAN node={next_node} awaiting={payload['continuity'].get('awaiting')}",
                    file=sys.stderr,
                )
                return 1

        if next_node is None:
            manifest["status"] = "completed"
            dod = manifest.setdefault("definition_of_done", {})
            dod["all_nodes_completed"] = True
            dod["delivery_bundle_written"] = dod.get("delivery_bundle_written", True)
            _sync_runner_required_actions(manifest, dsl)
            sync_continuity_from_nodes(manifest, workflow_id)
            save_manifest(run_id, manifest)
            print(json.dumps(_status_payload(run_id, manifest, dsl), indent=2))
            print(f"RUN_COMPLETE run_id={run_id}")
            return 0

        node_spec = _get_node_spec(dsl, next_node)
        if not _is_composite_node(node_spec):
            print(f"RUN BLOCKED: invalid node {next_node}", file=sys.stderr)
            return 1

        if _requires_agent_dispatch(node_spec, mode):
            from sdlc_delivery import node_skip_for_delivery  # noqa: WPS433

            delivery_skip, _delivery_reason = node_skip_for_delivery(node_spec, manifest)
            if not delivery_skip:
                prior_err = _prior_nodes_incomplete(manifest, order, next_node)
                if prior_err:
                    print(f"ERROR: {prior_err}", file=sys.stderr)
                    return 1
                next_status = (manifest.get("nodes") or {}).get(next_node, {}).get("status", "pending")
                if next_status != "running":
                    cmd_node_start(run_id, next_node)
                    manifest = load_manifest(run_id)
                print(json.dumps(_dispatch_payload(run_id, next_node, node_spec, manifest, dsl), indent=2))
                return 42

        outcome = _execute_composite_node(run_id, manifest, dsl, next_node, mode, max_retries)
        if outcome == "WAIT":
            manifest = load_manifest(run_id)
            payload = _status_payload(run_id, manifest, dsl)
            print(json.dumps(payload, indent=2))
            print(f"RUN AWAITING_HUMAN node={next_node}", file=sys.stderr)
            return 1
        if outcome == "TRANSITION":
            return _emit_step_delegate(run_id, dsl, next_node, outcome)
        if outcome in ("FAIL", "RETRY"):
            manifest = load_manifest(run_id)
            if manifest.get("status") == "in_progress":
                return _emit_step_delegate(run_id, dsl, next_node, outcome)
            manifest["status"] = "blocked"
            save_manifest(run_id, manifest)
            print(f"RUN BLOCKED at {next_node} outcome={outcome}", file=sys.stderr)
            return 1
        depth += 1

    print(
        f"ERROR: max_step_depth={limits['max_step_depth']} exceeded in single step invocation",
        file=sys.stderr,
    )
    return 1


def cmd_submit(run_id: str, node_id: str, cognitive_path: Path) -> int:
    if not cognitive_path.is_file():
        print(f"ERROR: cognitive output not found: {cognitive_path}", file=sys.stderr)
        return 1

    manifest = load_manifest(run_id)
    workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
    if not workflow_id:
        print("ERROR: manifest missing metadata.workflow_id", file=sys.stderr)
        return 1
    dsl = load_workflow_dsl(workflow_id)
    node_spec = _get_node_spec(dsl, node_id)
    if not _is_composite_node(node_spec):
        print(f"ERROR: invalid node {node_id}", file=sys.stderr)
        return 1

    node_output = _load_json(cognitive_path)
    authority_err = _validate_submit_authority(manifest, node_order_from_dsl(dsl), node_id, node_output, run_id)
    if authority_err:
        print(f"ERROR: SUBMIT BLOCKED — {authority_err}", file=sys.stderr)
        return 1

    output = _output_dir(manifest)
    target_cognitive = _cognitive_path(output, node_id)
    _write_json(target_cognitive, node_output)

    structured = node_output.get("structured") if isinstance(node_output.get("structured"), dict) else {}
    if node_id == "classify":
        mode = structured.get("mode") or structured.get("run_mode")
        if isinstance(mode, str) and mode.strip():
            manifest["run_mode"] = mode.strip()
    if node_id == "deploy":
        deployment = manifest.setdefault("deployment", {})
        for key in ("deploy_run_url", "ci_run_url", "production_url", "staging_url"):
            val = structured.get(key)
            if isinstance(val, str) and val.startswith("http"):
                deployment[key] = val
        from sdlc_delivery import record_closure, sync_definition_of_done  # noqa: WPS433

        record_closure(manifest, "staging-validated")
        sync_definition_of_done(manifest)
    if node_id == "post-deploy":
        deployment = manifest.setdefault("deployment", {})
        if structured.get("post_deploy_smoke_pass") is True:
            deployment["post_deploy_smoke_pass"] = True
        prod = structured.get("production_url")
        if isinstance(prod, str) and prod.startswith("http"):
            deployment["production_url"] = prod
        from sdlc_delivery import record_closure, sync_definition_of_done  # noqa: WPS433

        record_closure(manifest, "production-validated")
        sync_definition_of_done(manifest)
    if node_id == "validate-local":
        from sdlc_delivery import sync_definition_of_done  # noqa: WPS433

        sync_definition_of_done(manifest)
    save_manifest(run_id, manifest)
    manifest = load_manifest(run_id)

    ctx = RunContext(
        run_id=run_id,
        intent=manifest.get("intent", ""),
        manifest=manifest,
        node_id=node_id,
        execution_mode="agent",
        node_output=node_output,
        prior_outputs=_load_prior_outputs(output, manifest),
        output_dir=output,
    )

    post = node_spec.get("postCondition")
    gate_id = "structured-output.pass"
    gate_outcome = "PASS"
    if isinstance(post, dict) and post.get("checks"):
        post_result = execute_condition(post, ctx)
        gate_id = post_result.gate_id
        gate_outcome = post_result.outcome
        if not post_result.passed:
            if _apply_gate_wait(run_id, node_id, node_spec, post_result):
                dsl = load_workflow_dsl(workflow_id)
                manifest = load_manifest(run_id)
                payload = _status_payload(run_id, manifest, dsl)
                print(json.dumps(payload, indent=2))
                print(f"SUBMIT AWAITING_HUMAN node={node_id}", file=sys.stderr)
                return 1
            record = _gate_record(node_id, run_id, post_result)
            _complete_node_with_output(run_id, manifest, node_id, record, gate_outcome, gate_id)
            manifest = load_manifest(run_id)
            manifest = _apply_on_failure(manifest, dsl, node_id, post_result, node_spec)
            save_manifest(run_id, manifest)
            if manifest.get("status") == "in_progress":
                payload = _status_payload(run_id, manifest, dsl)
                print(json.dumps(payload, indent=2))
                print(f"SUBMIT TRANSITION node={node_id}: {post_result.message}", file=sys.stderr)
                return 1
            print(f"SUBMIT BLOCKED: {post_result.message}", file=sys.stderr)
            return 1

    manifest = load_manifest(run_id)
    node_state = (manifest.get("nodes") or {}).get(node_id, {})
    materialize_node_emits(node_spec, node_output, node_state, ctx)
    save_manifest(run_id, manifest)

    if _node_has_delivery_gate(node_spec):
        _write_delivery_bundle(run_id, manifest)
        _maybe_publish_deliverables(run_id, manifest)
        manifest = load_manifest(run_id)
        manifest.setdefault("definition_of_done", {})["delivery_bundle_written"] = True
        manifest["status"] = "completed"
        save_manifest(run_id, manifest)

    record = build_node_output(
        node_id,
        run_id,
        node_output.get("summary", f"submitted node {node_id}"),
        gate_id,
        gate_outcome,
        node_output.get("summary", "PASS"),
        structured=node_output.get("structured") if isinstance(node_output.get("structured"), dict) else {},
        confidence=float(node_output.get("confidence", 1.0)),
    )
    _complete_node_with_output(run_id, manifest, node_id, record, gate_outcome, gate_id)
    print(f"SUBMIT PASS node={node_id} gate={gate_id}")
    return 0


def _assert_no_goal_overlap(workflow_id: str) -> None:
    resolved = workflow_id
    if resolved in ("goal-flow", "e2e-orchestration-flow"):
        from sdlc_workflow_overlap import find_open_integration_conflicts, format_conflict_message

        conflicts = find_open_integration_conflicts()
        if conflicts:
            raise SystemExit(f"ERROR: {format_conflict_message(conflicts)}")


def run_workflow(
    workflow_id: str,
    intent: str,
    run_id: str | None,
    mode: str,
    max_retries: int,
) -> int:
    if run_id and manifest_path(run_id).is_file():
        manifest = load_manifest(run_id)
    else:
        _assert_no_goal_overlap(workflow_id)
        run_id = init_manifest(workflow_id, intent, run_id, mode)
        manifest = load_manifest(run_id)

    if mode == "agent":
        set_active(run_id)
        manifest["status"] = "in_progress"
        save_manifest(run_id, manifest)
        return cmd_step(run_id, mode, max_retries)

    set_active(run_id)
    dsl = load_workflow_dsl(workflow_id)
    order = node_order_from_dsl(dsl)
    manifest["status"] = "in_progress"
    save_manifest(run_id, manifest)

    retries = 0
    index = 0
    while index < len(order):
        node_id = order[index]
        node_spec = _get_node_spec(dsl, node_id)
        if not _is_composite_node(node_spec):
            print(
                f"RUN BLOCKED at {node_id}: invalid node — function.invoke + postCondition required",
                file=sys.stderr,
            )
            return 1

        outcome = _execute_composite_node(run_id, manifest, dsl, node_id, mode, max_retries)
        manifest = load_manifest(run_id)

        if outcome == "RETRY" and retries < max_retries:
            retries += 1
            state = manifest["nodes"][node_id]
            state["status"] = "pending"
            save_manifest(run_id, manifest)
            continue
        if outcome in ("FAIL", "RETRY"):
            manifest = load_manifest(run_id)
            if manifest.get("status") == "in_progress":
                save_manifest(run_id, manifest)
                return cmd_step(run_id, mode, max_retries)
            manifest["status"] = "blocked"
            save_manifest(run_id, manifest)
            print(f"RUN BLOCKED at {node_id} outcome={outcome}", file=sys.stderr)
            return 1
        retries = 0
        index += 1

    all_done = all(
        (manifest.get("nodes") or {}).get(node_id, {}).get("status") in ("completed", "skipped")
        for node_id in order
    )
    if all_done:
        manifest.setdefault("definition_of_done", {})["all_nodes_completed"] = True
        if not workflow_requires_delivery_bundle(dsl):
            manifest["status"] = "completed"
        elif (manifest.get("definition_of_done") or {}).get("delivery_bundle_written"):
            manifest["status"] = "completed"
        save_manifest(run_id, manifest)

    manifest = load_manifest(run_id)
    _sync_trace_from_manifest(run_id, manifest)

    result = subprocess.run(
        [sys.executable, str(BIN_DIR / "sdlc_workflow_manifest.py"), "validate", "--run-id", run_id],
        cwd=REPO_ROOT,
    )
    print(f"RUN_COMPLETE run_id={run_id} output={_output_dir(manifest)}")
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Execute SDLC workflow with idempotent resume")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run_parser = sub.add_parser("run")
    run_parser.add_argument("--workflow", required=True)
    run_parser.add_argument("--intent", required=True)
    run_parser.add_argument("--run-id")
    run_parser.add_argument("--mode", default="stub", choices=["stub", "agent"])
    run_parser.add_argument("--max-retries", type=int, default=3)

    resume_parser = sub.add_parser("resume")
    resume_parser.add_argument("--run-id", required=True)
    resume_parser.add_argument("--max-retries", type=int, default=3)

    status_parser = sub.add_parser("status")
    status_parser.add_argument("--run-id", required=True)

    step_parser = sub.add_parser("step")
    step_parser.add_argument("--run-id", required=True)
    step_parser.add_argument("--mode", default="agent", choices=["stub", "agent"])
    step_parser.add_argument("--max-retries", type=int, default=3)

    submit_parser = sub.add_parser("submit")
    submit_parser.add_argument("--run-id", required=True)
    submit_parser.add_argument("--node", required=True)
    submit_parser.add_argument("--cognitive", required=True, type=Path)

    redo_parser = sub.add_parser("node-redo")
    redo_parser.add_argument("--run-id", required=True)
    redo_parser.add_argument("--node", required=True)

    args = parser.parse_args()

    if args.cmd == "run":
        return run_workflow(args.workflow, args.intent, args.run_id, args.mode, args.max_retries)

    if args.cmd == "resume":
        manifest = load_manifest(args.run_id)
        workflow_id = (manifest.get("metadata") or {}).get("workflow_id")
        if not workflow_id:
            print("ERROR: manifest missing metadata.workflow_id", file=sys.stderr)
            return 1
        mode = manifest.get("execution", {}).get("mode", "stub")
        return run_workflow(workflow_id, manifest.get("intent", ""), args.run_id, mode, args.max_retries)

    if args.cmd == "status":
        return cmd_status(args.run_id)

    if args.cmd == "step":
        return cmd_step(args.run_id, args.mode, args.max_retries)

    if args.cmd == "submit":
        cognitive = args.cognitive
        if not cognitive.is_absolute():
            cognitive = (REPO_ROOT / cognitive).resolve()
        return cmd_submit(args.run_id, args.node, cognitive)

    if args.cmd == "node-redo":
        return cmd_node_redo(args.run_id, args.node)

    return 0


if __name__ == "__main__":
    sys.exit(main())
